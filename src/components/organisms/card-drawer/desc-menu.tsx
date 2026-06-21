"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./CardDrawer.module.scss";

export function DescMenu({
  hasContent,
  onEdit,
  onClear,
}: {
  hasContent: boolean;
  onEdit: () => void;
  onClear: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.kebabWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.kebabBtn}
        aria-label="Description actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className={styles.kebabMenu} role="menu">
          <button
            type="button"
            className={styles.kebabItem}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            {hasContent ? "Edit description" : "Add description"}
          </button>
          {hasContent && (
            <button
              type="button"
              className={`${styles.kebabItem} ${styles.kebabItemDanger}`}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void onClear();
              }}
            >
              Clear description
            </button>
          )}
        </div>
      )}
    </div>
  );
}
