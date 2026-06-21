"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colorForName } from "@/lib/palette";
import styles from "../_styles/MovePileMenu.module.scss";

type PileLite = { id: number; title: string | null; color?: string | null };

/**
 * A single kebab button that opens a card's actions (open, move to another
 * pile, delete) in a portal menu — so the actions stay reachable on the left
 * of a wide table row instead of scrolled off to the far right. The menu is
 * portaled to <body> so scrollable sections don't clip it.
 */
export default function CardActionsMenu({
  piles,
  currentPileId,
  canMove,
  canDelete,
  onMove,
  onDelete,
  onOpen,
}: {
  piles: PileLite[];
  currentPileId: number | null;
  canMove: boolean;
  canDelete: boolean;
  onMove: (pileId: number) => void;
  onDelete: () => void;
  onOpen: () => void;
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

  const targets = canMove ? piles.filter((p) => p.id !== currentPileId) : [];

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 210;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, left });
    setOpen(true);
  };

  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={styles.trigger}
        onClick={toggle}
        aria-label="Card actions"
        title="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋮
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            style={{ top: pos.top, left: pos.left }}
            role="menu"
          >
            <button type="button" role="menuitem" className={styles.menuItem} onClick={run(onOpen)}>
              <span className={styles.itemTitle}>Open card</span>
            </button>

            {targets.length > 0 && (
              <>
                <div className={styles.divider} />
                <div className={styles.menuLabel}>Move to…</div>
                {targets.map((p) => {
                  const c = colorForName(p.color ?? "slate");
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={run(() => onMove(p.id))}
                    >
                      <span className={styles.dot} style={{ background: c.hue }} aria-hidden />
                      <span className={styles.itemTitle}>{p.title || "Untitled"}</span>
                    </button>
                  );
                })}
              </>
            )}

            {canDelete && (
              <>
                <div className={styles.divider} />
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  onClick={run(onDelete)}
                >
                  <span className={styles.itemTitle}>Delete card</span>
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
