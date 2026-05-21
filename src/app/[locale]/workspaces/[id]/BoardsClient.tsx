"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import styles from "../AppShell.module.scss";

type Board = { id: number; title: string | null; createdAt: Date | string | null };

export default function BoardsClient({
  workspaceId,
  initial,
}: {
  workspaceId: number;
  initial: Board[];
}) {
  const [boards, setBoards] = useState(initial);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    setSaving(true);

    const tempId = -Date.now();
    startTransition(() => {
      setBoards((prev) => [
        ...prev,
        { id: tempId, title: trimmed, createdAt: new Date().toISOString() },
      ]);
      setTitle("");
    });

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBoards((prev) => prev.filter((b) => b.id !== tempId));
        setError(data.error || "Could not create board");
        return;
      }
      setBoards((prev) =>
        prev.map((b) =>
          b.id === tempId ? { id: data.board.id, title: data.board.title, createdAt: b.createdAt } : b,
        ),
      );
    } catch {
      setBoards((prev) => prev.filter((b) => b.id !== tempId));
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Boards</h1>
        <span className={styles.pageMeta}>
          {boards.length} {boards.length === 1 ? "board" : "boards"}
          {(pending || saving) && <span className={styles.savingDot} />}
        </span>
      </div>

      <form className={styles.composer} onSubmit={onCreate}>
        <input
          className={styles.composerInput}
          placeholder="New board name…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          aria-label="New board name"
        />
        <div className={styles.composerActions}>
          <button type="submit" className={styles.primaryBtn} disabled={!title.trim()}>
            Create
          </button>
        </div>
      </form>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {boards.length === 0 ? (
        <div className={styles.empty}>
          <strong>No boards yet</strong>
          Add a board to organize tasks.
        </div>
      ) : (
        <div className={styles.grid}>
          {boards.map((b) => (
            <Link
              key={b.id}
              href={b.id > 0 ? `/boards/${b.id}` : "#"}
              className={styles.card}
              prefetch={b.id > 0}
            >
              <div className={styles.cardTitle}>{b.title || "Untitled"}</div>
              <div className={styles.cardFooter}>
                <span className={styles.cardCount}>board</span>
                <span className={styles.cardArrow}>›</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
