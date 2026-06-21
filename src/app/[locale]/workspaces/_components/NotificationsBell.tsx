"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "../_styles/NotificationsBell.module.scss";

type Notification = {
  id: number;
  type: "card_assigned" | "card_comment" | "card_mention";
  readAt: string | null;
  createdAt: string | null;
  cardId: number | null;
  boardId: number | null;
  workspaceId: number | null;
  cardTitle: string | null;
  boardTitle: string | null;
  workspaceTitle: string | null;
  actorFirstname: string | null;
  actorLastname: string | null;
  actorEmail: string | null;
  payload: { preview?: string } | null;
};

function actorName(n: Notification): string {
  const x = [n.actorFirstname, n.actorLastname].filter(Boolean).join(" ");
  return x || n.actorEmail || "Someone";
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const POLL_MS = 60_000;

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=50");
      if (!res.ok) return;
      const json = await res.json();
      setItems(json.notifications ?? []);
      setUnread(json.unread ?? 0);
    } catch {
      // ignore — keep last known state
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = async () => {
    if (unread === 0) return;
    setUnread(0);
    setItems((prev) =>
      prev.map((n) =>
        n.readAt ? n : { ...n, readAt: new Date().toISOString() },
      ),
    );
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      load();
    }
  };

  const onItemClick = async (n: Notification) => {
    if (!n.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );
      try {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [n.id] }),
        });
      } catch {
        // best-effort
      }
    }
    setOpen(false);
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.bellBtn} ${open ? styles.bellBtnActive : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
      >
        <svg
          className={styles.bellGlyph}
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 4.5 1.5 6 2 6.5H4c.5-.5 2-2 2-6.5Z" />
          <path d="M10 18a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && <span className={styles.dot}>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className={styles.menu} role="dialog">
          <div className={styles.head}>
            <span className={styles.title}>Notifications</span>
            {unread > 0 && (
              <button type="button" className={styles.linkBtn} onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className={styles.empty}>You're all caught up.</div>
          ) : (
            <ul className={styles.list}>
              {items.map((n) => {
                const href = n.boardId
                  ? n.cardId
                    ? `/boards/${n.boardId}?card=${n.cardId}`
                    : `/boards/${n.boardId}`
                  : "/workspaces";
                return (
                  <li key={n.id}>
                    <Link
                      href={href}
                      className={`${styles.row} ${n.readAt ? "" : styles.rowUnread}`}
                      onClick={() => onItemClick(n)}
                    >
                      <span className={styles.rowTime}>{formatTime(n.createdAt)}</span>
                      <div className={styles.rowMain}>
                        <div className={styles.rowText}>
                          <strong>{actorName(n)}</strong>{" "}
                          {n.type === "card_assigned"
                            ? "assigned you to"
                            : n.type === "card_mention"
                            ? "mentioned you on"
                            : "commented on"}{" "}
                          <strong>{n.cardTitle || "a card"}</strong>
                        </div>
                        <div className={styles.rowSub}>
                          {n.workspaceTitle || "workspace"} ·{" "}
                          {n.boardTitle || "board"}
                          {(n.type === "card_comment" || n.type === "card_mention") &&
                            n.payload?.preview && (
                              <span className={styles.rowPreview}>
                                {" "}— {n.payload.preview}
                              </span>
                            )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
