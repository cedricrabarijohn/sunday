"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "./AuthForm.module.scss";

export default function VerifyEmailClient() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return; // guard strict-mode double-invoke
    ran.current = true;
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setState("ok");
        } else {
          setState("error");
          setMessage(data.error || "Could not confirm your email.");
        }
      })
      .catch(() => {
        setState("error");
        setMessage("Network error. Please try again.");
      });
  }, [token]);

  // No token at all: a static error, no effect state needed.
  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.brand}>sunday</div>
        <h1 className={styles.title}>Couldn&apos;t confirm</h1>
        <p className={styles.lead}>This confirmation link is missing its token.</p>
        <div className={styles.footer}>
          <Link href="/workspaces">Continue to the app</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.brand}>sunday</div>
      {state === "loading" && <h1 className={styles.title}>Confirming your email…</h1>}
      {state === "ok" && (
        <>
          <h1 className={styles.title}>Email confirmed</h1>
          <p className={styles.lead}>You&apos;re all set. Thanks for confirming.</p>
          <div className={styles.footer}>
            <Link href="/workspaces">Go to your workspaces</Link>
          </div>
        </>
      )}
      {state === "error" && (
        <>
          <h1 className={styles.title}>Couldn&apos;t confirm</h1>
          <p className={styles.lead}>{message}</p>
          <div className={styles.footer}>
            <Link href="/workspaces">Continue to the app</Link>
          </div>
        </>
      )}
    </div>
  );
}
