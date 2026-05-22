"use client";

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./ConfirmDialog.module.scss";

export type ConfirmOptions = {
  title?: string;
  message?: ReactNode;
  confirmLabel?: string;
  /** Pass null to render an Alert-style dialog with only a single button. */
  cancelLabel?: string | null;
  danger?: boolean;
};

type Resolver = (value: boolean) => void;

type Ctx = {
  /** Returns true if the user clicked the primary button, false otherwise. */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Single-button informational dialog. Resolves when the user acknowledges. */
  alert: (opts: ConfirmOptions) => Promise<void>;
};

const ConfirmContext = createContext<Ctx | null>(null);

/**
 * Hook to open a styled confirmation / alert dialog from anywhere.
 *
 *   const { confirm } = useConfirm();
 *   if (await confirm({ title: "Delete?", danger: true })) { ... }
 */
export function useConfirm(): Ctx {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export default function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const settle = useCallback((value: boolean) => {
    const r = resolverRef.current;
    resolverRef.current = null;
    setOpts(null);
    r?.(value);
  }, []);

  const confirm = useCallback((o: ConfirmOptions) => {
    // If a dialog is already open, immediately resolve it as cancelled
    // before opening the new one.
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOpts(o);
    });
  }, []);

  const alert = useCallback(
    async (o: ConfirmOptions) => {
      await confirm({ ...o, cancelLabel: null });
    },
    [confirm],
  );

  // Esc cancels, Enter confirms. Lock body scroll while open.
  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        settle(true);
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Autofocus the primary button after the portal mounts.
    const id = requestAnimationFrame(() => confirmButtonRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      cancelAnimationFrame(id);
    };
  }, [opts, settle]);

  const showCancel = opts ? opts.cancelLabel !== null : false;

  return (
    <ConfirmContext.Provider value={{ confirm, alert }}>
      {children}
      {mounted && opts &&
        createPortal(
          <div className={styles.backdrop} onClick={() => settle(false)}>
            <div
              className={styles.dialog}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={opts.title ? "confirm-title" : undefined}
              onClick={(e) => e.stopPropagation()}
            >
              <span className={`${styles.icon} ${opts.danger ? styles.iconDanger : ""}`} aria-hidden>
                {opts.danger ? "!" : "?"}
              </span>
              {opts.title && (
                <div id="confirm-title" className={styles.title}>
                  {opts.title}
                </div>
              )}
              {opts.message && <div className={styles.message}>{opts.message}</div>}
              <div className={styles.actions}>
                {showCancel && (
                  <button
                    type="button"
                    className={styles.cancel}
                    onClick={() => settle(false)}
                  >
                    {opts.cancelLabel || "Cancel"}
                  </button>
                )}
                <button
                  ref={confirmButtonRef}
                  type="button"
                  className={opts.danger ? styles.confirmDanger : styles.confirm}
                  onClick={() => settle(true)}
                >
                  {opts.confirmLabel || (showCancel ? "Confirm" : "OK")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ConfirmContext.Provider>
  );
}
