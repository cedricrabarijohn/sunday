"use client";

import { FormEvent, useCallback, useRef, useState, useTransition } from "react";
import styles from "../../workspaces/AppShell.module.scss";

type Task = {
  id: number;
  title: string | null;
  position: number | null;
};

export default function TasksClient({
  boardId,
  initial,
}: {
  boardId: number;
  initial: Task[];
}) {
  const [tasks, setTasks] = useState(initial);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

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
      setTasks((prev) => [...prev, { id: tempId, title: trimmed, position: nextPos }]);
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
          t.id === tempId ? { id: data.task.id, title: data.task.title, position: data.task.position } : t,
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

  return (
    <>
      <form className={styles.composer} onSubmit={onAdd}>
        <input
          className={styles.composerInput}
          placeholder="Add a task…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={255}
          aria-label="New task"
        />
        <div className={styles.composerActions}>
          <button type="submit" className={styles.primaryBtn} disabled={!newTitle.trim()}>
            Add
          </button>
        </div>
      </form>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {tasks.length === 0 ? (
        <div className={styles.empty}>
          <strong>No tasks yet</strong>
          Add your first task above.
        </div>
      ) : (
        <>
          <div className={styles.pageMeta} style={{ marginBottom: "0.6rem" }}>
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
            {(pending || saving) && <span className={styles.savingDot} />}
          </div>
          <div className={styles.tasksList}>
            {tasks.map((t, i) => (
              <div key={t.id} className={styles.taskRow}>
                <span className={styles.taskNum}>{i + 1}</span>
                <span className={styles.taskCheck} aria-hidden />
                <input
                  className={styles.taskTitle}
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
        </>
      )}
    </>
  );
}
