"use client";

import { CSSProperties, FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { colorForId } from "@/lib/palette";
import styles from "../AppShell.module.scss";

type Board = { id: number; title: string | null; createdAt: Date | string | null };

export default function BoardsClient({
  workspaceId,
  workspaceTitle,
  initial,
}: {
  workspaceId: number;
  workspaceTitle: string | null;
  initial: Board[];
}) {
  const [boards, setBoards] = useState(initial);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const wsColor = colorForId(workspaceId);

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
        <div className={styles.pageHeaderText}>
          <span
            className={styles.pageBadge}
            style={{ background: wsColor.soft, color: wsColor.hue }}
          >
            {(workspaceTitle?.[0] || "W").toUpperCase()}
          </span>
          <div>
            <h1 className={styles.pageTitle}>{workspaceTitle || "Untitled"}</h1>
            <div className={styles.pageSubtitle}>Boards in this workspace</div>
          </div>
        </div>
        <span className={styles.pageMeta}>
          {boards.length.toString().padStart(2, "0")}{" "}
          {boards.length === 1 ? "board" : "boards"}
          {(pending || saving) && <span className={styles.savingDot} />}
        </span>
      </div>

      <form className={styles.composer} onSubmit={onCreate}>
        <input
          className={styles.composerInput}
          placeholder="Name a new board and press enter"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          aria-label="New board name"
        />
        <div className={styles.composerActions}>
          <span className={styles.kbdHint}>↵</span>
          <button type="submit" className={styles.primaryBtn} disabled={!title.trim()}>
            Create
          </button>
        </div>
      </form>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {boards.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyMark}>≡</div>
          <strong>No boards yet</strong>
          A board holds a list of tasks. Create your first one above.
        </div>
      ) : (
        <div className={styles.grid}>
          {boards.map((b) => {
            const c = colorForId(b.id);
            const style = {
              "--card-hue": c.hue,
              "--card-soft": c.soft,
            } as CSSProperties;
            const letter = (b.title?.[0] || "B").toUpperCase();
            return (
              <Link
                key={b.id}
                href={b.id > 0 ? `/boards/${b.id}` : "#"}
                className={styles.card}
                style={style}
                prefetch={b.id > 0}
              >
                <span className={styles.cardBadge}>{letter}</span>
                <div className={styles.cardTitle}>{b.title || "Untitled"}</div>
                <div className={styles.cardFooter}>
                  <span className={styles.cardCount}>{c.name}</span>
                  <span className={styles.cardArrow}>→</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
