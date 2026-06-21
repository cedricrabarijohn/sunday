"use client";

import { ReactNode, useEffect, useRef } from "react";
import styles from "../styles/CardDrawer.module.scss";

export function MetaPopover({
  open,
  setOpen,
  label,
  trigger,
  triggerClassName,
  children,
  disabled = false,
}: {
  open: boolean;
  setOpen: (next: boolean) => void;
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled || !open) return;
    const onDown = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, disabled]);

  // Read-only viewers still see the assignees/labels, just can't open the picker.
  if (disabled) {
    return (
      <div className={styles.popoverAnchor}>
        <span className={triggerClassName ?? styles.metaTrigger} aria-label={label} title={label}>
          {trigger}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.popoverAnchor} ref={anchorRef}>
      <button
        type="button"
        className={`${triggerClassName ?? styles.metaTrigger} ${open ? styles.metaTriggerActive : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        {trigger}
      </button>
      {open && (
        <div className={styles.popover} role="dialog">
          {children}
        </div>
      )}
    </div>
  );
}
