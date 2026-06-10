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
import { CheckIcon, XIcon } from "@/components/Icons";
import styles from "./Toast.module.scss";

type ToastKind = "success" | "error" | "info";

type ToastAction = { label: string; onClick: () => void };
type ToastOptions = { ttl?: number; action?: ToastAction };

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
};

type ToastApi = {
  success: (message: string, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
  info: (message: string, opts?: ToastOptions) => void;
};

const ToastContext = createContext<ToastApi | null>(null);
const DEFAULT_TTL = 3500;

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

export default function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const counter = useRef(0);

  useEffect(() => {
    // Portal mount guard for SSR — intentional one-shot, not a render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, opts?: ToastOptions) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((prev) => [...prev, { id, kind, message, action: opts?.action }]);
      window.setTimeout(() => dismiss(id), opts?.ttl ?? DEFAULT_TTL);
    },
    [dismiss],
  );

  const api: ToastApi = {
    success: (m, o) => push("success", m, o),
    error: (m, o) => push("error", m, o),
    info: (m, o) => push("info", m, o),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div className={styles.stack} role="region" aria-live="polite">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`${styles.toast} ${styles[`toast-${t.kind}`]}`}
                role={t.kind === "error" ? "alert" : "status"}
              >
                <span className={styles.icon} aria-hidden>
                  {t.kind === "success" ? <CheckIcon size={14} /> : null}
                  {t.kind === "error" ? <XIcon size={14} /> : null}
                  {t.kind === "info" ? <CheckIcon size={14} /> : null}
                </span>
                <span className={styles.body}>{t.message}</span>
                {t.action && (
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.close}
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                >
                  <XIcon size={12} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
