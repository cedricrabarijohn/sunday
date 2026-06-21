"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colorForName } from "@/lib/palette";
import { MoveIcon } from "@/components/Icons";
import styles from "../_styles/MovePileMenu.module.scss";

type PileLite = { id: number; title: string | null; color?: string | null };

/**
 * A compact "move to pile" control for a card — an alternative to dragging it
 * across the board. The menu is portaled to <body> and positioned from the
 * trigger rect so it isn't clipped by scrollable piles/table sections.
 */
export default function MovePileMenu({
  piles,
  currentPileId,
  onMove,
}: {
  piles: PileLite[];
  currentPileId: number | null;
  onMove: (pileId: number) => void;
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

  const targets = piles.filter((p) => p.id !== currentPileId);
  if (targets.length === 0) return null;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 210;
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, left });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={styles.trigger}
        onClick={toggle}
        aria-label="Move to pile"
        title="Move to pile"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoveIcon size={13} />
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
            <div className={styles.menuLabel}>Move to…</div>
            {targets.map((p) => {
              const c = colorForName(p.color ?? "slate");
              return (
                <button
                  key={p.id}
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(p.id);
                    setOpen(false);
                  }}
                >
                  <span className={styles.dot} style={{ background: c.hue }} aria-hidden />
                  <span className={styles.itemTitle}>{p.title || "Untitled"}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
