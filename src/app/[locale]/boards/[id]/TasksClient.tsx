"use client";

import {
  CSSProperties,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { colorForId } from "@/lib/palette";
import styles from "../../workspaces/AppShell.module.scss";

function useAnimatedNumber(target: number, duration = 480) {
  const [value, setValue] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - start;
      const p = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prev.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

type Task = {
  id: number;
  title: string | null;
  done: number;
  position: number | null;
};

export default function TasksClient({
  boardId,
  boardTitle,
  workspaceId,
  workspaceTitle,
  initial,
}: {
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
  initial: Task[];
}) {
  const [tasks, setTasks] = useState(initial);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const boardColor = colorForId(boardId);
  const renameTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.reduce((acc, t) => acc + (t.done ? 1 : 0), 0);
    const open = total - done;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, open, pct };
  }, [tasks]);

  const animatedPct = useAnimatedNumber(stats.pct);
  const animatedDone = useAnimatedNumber(stats.done, 320);
  const animatedOpen = useAnimatedNumber(stats.open, 320);
  const celebrate = stats.total > 0 && stats.pct === 100;

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setError(null);
    setSaving(true);

    const tempId = -Date.now();
    const nextPos = (tasks.at(-1)?.position ?? 0) + 1;
    startTransition(() => {
      setTasks((prev) => [...prev, { id: tempId, title: trimmed, done: 0, position: nextPos }]);
      setNewTitle("");
    });

    try {
      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
        setError(data.error || "Could not add task");
        return;
      }
      setTasks((prev) =>
        prev.map((t) =>
          t.id === tempId
            ? { id: data.task.id, title: data.task.title, done: 0, position: data.task.position }
            : t,
        ),
      );
    } catch {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const onRename = useCallback((id: number, title: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    if (id < 0) return;

    const existing = renameTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Could not save change");
        }
      } catch {
        setError("Network error. Change not saved.");
      }
    }, 400);
    renameTimers.current.set(id, timer);
  }, []);

  async function onToggleDone(id: number, current: number) {
    const next = current ? 0 : 1;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: next } : t)));
    if (id < 0) return;
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !current }),
      });
      if (!res.ok) {
        setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: current } : t)));
        setError("Could not update task");
      }
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: current } : t)));
      setError("Network error. Please try again.");
    }
  }

  async function onDelete(id: number) {
    const snapshot = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (id < 0) return;
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setTasks(snapshot);
        setError("Could not delete task");
      }
    } catch {
      setTasks(snapshot);
      setError("Network error. Please try again.");
    }
  }

  const headerStyle = {
    "--card-hue": boardColor.hue,
    "--card-soft": boardColor.soft,
  } as CSSProperties;

  return (
    <>
      <div className={styles.pageHeader} style={headerStyle}>
        <div className={styles.pageHeaderText}>
          <span
            className={styles.pageBadge}
            style={{ background: boardColor.soft, color: boardColor.hue }}
          >
            {(boardTitle?.[0] || "B").toUpperCase()}
          </span>
          <div>
            <h1 className={styles.pageTitle}>{boardTitle || "Untitled board"}</h1>
            <div className={styles.pageSubtitle}>
              in{" "}
              <Link
                href={`/workspaces/${workspaceId}`}
                style={{ color: "var(--text-2)", borderBottom: "1px dotted var(--border-strong)" }}
              >
                {workspaceTitle || "workspace"}
              </Link>
            </div>
          </div>
        </div>
        <span className={styles.pageMeta}>
          {stats.done}/{stats.total} done
          {(pending || saving) && <span className={styles.savingDot} />}
        </span>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.boardLayout}>
        <div>
          <form className={styles.composer} onSubmit={onAdd}>
            <input
              className={styles.composerInput}
              placeholder="Add a task and press enter"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={255}
              aria-label="New task"
            />
            <div className={styles.composerActions}>
              <span className={styles.kbdHint}>↵</span>
              <button type="submit" className={styles.primaryBtn} disabled={!newTitle.trim()}>
                Add
              </button>
            </div>
          </form>

          {tasks.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyMark}>✓</div>
              <strong>Nothing here yet</strong>
              Type a task above. Hit the box to mark it done.
            </div>
          ) : (
            <div className={styles.tasksList}>
              {tasks.map((t, i) => (
                <div key={t.id} className={styles.taskRow}>
                  <span className={styles.taskNum}>{String(i + 1).padStart(2, "0")}</span>
                  <button
                    type="button"
                    className={`${styles.taskCheck} ${t.done ? styles.taskCheckDone : ""}`}
                    onClick={() => onToggleDone(t.id, t.done)}
                    aria-label={t.done ? "Mark as not done" : "Mark as done"}
                  />
                  <input
                    className={`${styles.taskTitle} ${t.done ? styles.taskTitleDone : ""}`}
                    defaultValue={t.title || ""}
                    onChange={(e) => onRename(t.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <button
                    className={styles.dangerBtn}
                    onClick={() => onDelete(t.id)}
                    type="button"
                    aria-label="Delete task"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className={styles.statsCol}>
          <div className={`${styles.statsCard} ${celebrate ? styles.celebrate : ""}`}>
            <div className={styles.statsLabel}>Progress</div>
            <div className={styles.statsNumber}>{animatedPct}%</div>
            <div className={styles.statsDelta}>
              {celebrate ? "All clear. Time for a coffee." : `${stats.done} done · ${stats.open} open`}
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${stats.pct}%` }}
              />
            </div>
            <div className={styles.statsLegend}>
              <span>0</span>
              <span>{stats.total}</span>
            </div>
          </div>

          <div className={styles.statsCard}>
            <div className={styles.statsLabel}>This board</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-3)" }}>Total</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{stats.total}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-3)" }}>Done</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: boardColor.hue }}>
                  {animatedDone}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-3)" }}>Open</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{animatedOpen}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
