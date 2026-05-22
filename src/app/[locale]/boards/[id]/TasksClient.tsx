"use client";

import { CSSProperties, FormEvent, useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { colorForName } from "@/lib/palette";
import CardDrawer, { CardCounts } from "@/components/organisms/card-drawer/CardDrawer";
import rowStyles from "./Task.module.scss";
import styles from "../../workspaces/AppShell.module.scss";

type CardLabel = { id: number; title: string; color: string };

export type WorkspaceLabel = {
  id: number;
  title: string;
  color: string;
  position: number | null;
  isDefault: number;
};

type Task = {
  id: number;
  title: string | null;
  position: number | null;
  itemsTotal: number;
  itemsDone: number;
  attachments: number;
  labels: CardLabel[];
};

export default function TasksClient({
  boardId,
  boardTitle,
  workspaceId,
  workspaceTitle,
  initial,
  initialLabels,
}: {
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
  initial: Task[];
  initialLabels: WorkspaceLabel[];
}) {
  const [tasks, setTasks] = useState(initial);
  const [labels, setLabels] = useState<WorkspaceLabel[]>(initialLabels);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [openCardId, setOpenCardId] = useState<number | null>(null);

  const boardColorName = "indigo";
  const boardColor = colorForName(boardColorName);
  const renameTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setError(null);
    setSaving(true);

    const tempId = -Date.now();
    const nextPos = (tasks.at(-1)?.position ?? 0) + 1;
    startTransition(() => {
      setTasks((prev) => [
        ...prev,
        {
          id: tempId,
          title: trimmed,
          position: nextPos,
          itemsTotal: 0,
          itemsDone: 0,
          attachments: 0,
          labels: [],
        },
      ]);
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
            ? { ...t, id: data.task.id, title: data.task.title, position: data.task.position }
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
          {tasks.length} {tasks.length === 1 ? "card" : "cards"}
          {(pending || saving) && <span className={styles.savingDot} />}
        </span>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <form className={styles.composer} onSubmit={onAdd}>
        <input
          className={styles.composerInput}
          placeholder="Add a card and press enter"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={255}
          aria-label="New card"
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
          <div className={styles.emptyMark}>＋</div>
          <strong>No cards yet</strong>
          Type a title above to add your first card.
        </div>
      ) : (
        <div className={styles.tasksList}>
          {tasks.map((t, i) => {
            const itemPct =
              t.itemsTotal === 0 ? 0 : Math.round((t.itemsDone / t.itemsTotal) * 100);
            return (
              <div key={t.id} className={styles.taskRow}>
                <span className={styles.taskNum}>{String(i + 1).padStart(2, "0")}</span>
                <input
                  className={styles.taskTitle}
                  defaultValue={t.title || ""}
                  onChange={(e) => onRename(t.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
                {t.labels.length > 0 && (
                  <div className={rowStyles.chips}>
                    {t.labels.map((l) => {
                      const c = colorForName(l.color);
                      return (
                        <span
                          key={l.id}
                          className={rowStyles.chip}
                          style={{ background: c.soft, color: c.hue, borderColor: c.soft }}
                          title={l.title}
                        >
                          <span
                            className={rowStyles.chipDot}
                            style={{ background: c.hue }}
                            aria-hidden
                          />
                          <span className={rowStyles.chipText}>{l.title}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className={rowStyles.badges}>
                  {t.itemsTotal > 0 && (
                    <button
                      type="button"
                      className={rowStyles.badge}
                      onClick={() => t.id > 0 && setOpenCardId(t.id)}
                      aria-label="Open card sub-tasks"
                      title={`${t.itemsDone} of ${t.itemsTotal} sub-tasks done`}
                      data-complete={t.itemsTotal === t.itemsDone}
                    >
                      <span className={rowStyles.badgeIcon} aria-hidden>✓</span>
                      <span>
                        {t.itemsDone}/{t.itemsTotal}
                      </span>
                      <span className={rowStyles.miniBar} aria-hidden>
                        <span
                          className={rowStyles.miniBarFill}
                          style={{ width: `${itemPct}%` }}
                        />
                      </span>
                    </button>
                  )}
                  {t.attachments > 0 && (
                    <button
                      type="button"
                      className={rowStyles.badge}
                      onClick={() => t.id > 0 && setOpenCardId(t.id)}
                      aria-label="Open card images"
                      title={`${t.attachments} ${t.attachments === 1 ? "image" : "images"}`}
                    >
                      <span className={rowStyles.badgeIcon} aria-hidden>▣</span>
                      <span>{t.attachments}</span>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className={rowStyles.openBtn}
                  onClick={() => t.id > 0 && setOpenCardId(t.id)}
                  aria-label="Open card details"
                  title="Open card"
                >
                  ›
                </button>
                <button
                  className={styles.dangerBtn}
                  onClick={() => onDelete(t.id)}
                  type="button"
                  aria-label="Delete card"
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}

      {openCardId !== null && (
        <CardDrawer
          cardId={openCardId}
          workspaceId={workspaceId}
          workspaceLabels={labels}
          onWorkspaceLabelsChange={setLabels}
          onClose={() => setOpenCardId(null)}
          onCountsChange={(id, counts: CardCounts) =>
            setTasks((prev) =>
              prev.map((t) =>
                t.id === id
                  ? {
                      ...t,
                      itemsTotal: counts.itemsTotal,
                      itemsDone: counts.itemsDone,
                      attachments: counts.attachments,
                    }
                  : t,
              ),
            )
          }
          onTitleChange={(id, title) =>
            setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)))
          }
          onLabelsChange={(id, cardLabels) =>
            setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, labels: cardLabels } : t)))
          }
          onDelete={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))}
        />
      )}
    </>
  );
}
