"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./AssignMenu.module.scss";

export type AssignMember = {
  userId: number;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
};

function initialsFor(m: AssignMember): string {
  const f = m.firstname?.[0] ?? "";
  const l = m.lastname?.[0] ?? "";
  if (f || l) return (f + l).toUpperCase();
  return (m.email?.[0] ?? "?").toUpperCase();
}

function nameFor(m: AssignMember): string {
  const n = [m.firstname, m.lastname].filter(Boolean).join(" ");
  return n || m.email || "Unknown";
}

/**
 * A compact assignee picker for a card on the board — assign people without
 * opening the card drawer. The menu is portaled to <body> and positioned from
 * the trigger rect so it isn't clipped by scrollable piles. Multi-select: it
 * stays open while you toggle members.
 *
 * The trigger itself is supplied by the parent (`children`) — typically the
 * card's avatar stack, or an empty slot when nobody is assigned — so there's
 * no extra button: you click the avatars/slot to open the picker.
 */
export default function AssignMenu({
  members,
  loading,
  assignedIds,
  onOpen,
  onToggle,
  children,
  triggerClassName,
  triggerLabel = "Assign people",
}: {
  members: AssignMember[] | null;
  loading: boolean;
  assignedIds: Set<number>;
  /** Called when the menu opens, so the parent can lazy-load the member list. */
  onOpen: () => void;
  onToggle: (member: AssignMember) => void;
  /** Trigger content — e.g. the avatar stack or an empty slot. */
  children: ReactNode;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Any scroll/resize invalidates the anchored position — just close.
    const onReflow = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 230;
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, left });
    onOpen();
    setOpen(true);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={triggerClassName ?? styles.trigger}
        onClick={toggle}
        aria-label={triggerLabel}
        title={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {children}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            style={{ top: pos.top, left: pos.left }}
            role="menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.menuLabel}>Assign to…</div>
            {loading && (members === null || members.length === 0) ? (
              <div className={styles.menuHint}>Loading…</div>
            ) : members && members.length > 0 ? (
              members.map((m) => {
                const checked = assignedIds.has(m.userId);
                return (
                  <button
                    key={m.userId}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    className={styles.menuItem}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(m);
                    }}
                  >
                    <span className={styles.pip}>{initialsFor(m)}</span>
                    <span className={styles.itemTitle}>{nameFor(m)}</span>
                    <span
                      className={`${styles.check} ${checked ? styles.checkOn : ""}`}
                      aria-hidden
                    />
                  </button>
                );
              })
            ) : (
              <div className={styles.menuHint}>No members on this board.</div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
