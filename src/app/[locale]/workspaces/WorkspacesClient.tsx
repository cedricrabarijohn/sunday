"use client";

import { CSSProperties, FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { colorForId } from "@/lib/palette";
import styles from "./AppShell.module.scss";

type Workspace = { id: number; title: string | null };

export default function WorkspacesClient({ initial }: { initial: Workspace[] }) {
  const [workspaces, setWorkspaces] = useState(initial);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  function cancelCreate() {
    setCreating(false);
    setTitle("");
    setError(null);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    setSaving(true);

    const tempId = -Date.now();
    startTransition(() => {
      setWorkspaces((prev) => [...prev, { id: tempId, title: trimmed }]);
      setTitle("");
      setCreating(false);
    });

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWorkspaces((prev) => prev.filter((w) => w.id !== tempId));
        setError(data.error || "Could not create workspace");
        return;
      }
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id === tempId ? { id: data.workspace.id, title: data.workspace.title } : w,
        ),
      );
    } catch {
      setWorkspaces((prev) => prev.filter((w) => w.id !== tempId));
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderText}>
          <div>
            <h1 className={styles.pageTitle}>Workspaces</h1>
            <div className={styles.pageSubtitle}>
              Every project lives in a workspace. Pick one or start a new one.
            </div>
          </div>
        </div>
        <span className={styles.pageMeta}>
          {workspaces.length.toString().padStart(2, "0")}{" "}
          {workspaces.length === 1 ? "workspace" : "workspaces"}
          {(pending || saving) && <span className={styles.savingDot} />}
        </span>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.grid}>
        {workspaces.map((w) => {
          const c = colorForId(w.id);
          const style = {
            "--card-hue": c.hue,
            "--card-soft": c.soft,
          } as CSSProperties;
          const letter = (w.title?.[0] || "W").toUpperCase();
          return (
            <Link
              key={w.id}
              href={w.id > 0 ? `/workspaces/${w.id}` : "#"}
              className={styles.card}
              style={style}
              prefetch={w.id > 0}
            >
              <span className={styles.cardBadge}>{letter}</span>
              <div className={styles.cardTitle}>{w.title || "Untitled"}</div>
              <div className={styles.cardFooter}>
                <span className={styles.cardCount}>{c.name}</span>
                <span className={styles.cardArrow}>→</span>
              </div>
            </Link>
          );
        })}

        {creating ? (
          <form className={`${styles.card} ${styles.addCard} ${styles.addCardForm}`} onSubmit={onCreate}>
            <input
              className={styles.addCardInput}
              placeholder="Workspace name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelCreate();
              }}
              maxLength={50}
              aria-label="New workspace name"
              autoFocus
            />
            <div className={styles.addCardActions}>
              <button type="button" className={styles.ghostBtn} onClick={cancelCreate}>
                Cancel
              </button>
              <button type="submit" className={styles.primaryBtn} disabled={!title.trim()}>
                Create
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className={`${styles.card} ${styles.addCard} ${styles.addCardBtn}`}
            onClick={() => setCreating(true)}
          >
            <span className={styles.addCardIcon}>＋</span>
            <span className={styles.addCardLabel}>New workspace</span>
          </button>
        )}
      </div>
    </>
  );
}
