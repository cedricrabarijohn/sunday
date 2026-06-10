"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import styles from "./AuthForm.module.scss";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always show the same confirmation (no account enumeration).
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className={styles.card}>
        <div className={styles.brand}>sunday</div>
        <h1 className={styles.title}>Check your inbox</h1>
        <p className={styles.lead}>
          If an account exists for <strong>{email}</strong>, we just sent a link
          to reset your password. It expires in 30 minutes.
        </p>
        <div className={styles.footer}>
          <Link href="/users/sign_in">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.brand}>sunday</div>
      <h1 className={styles.title}>Reset your password</h1>
      <p className={styles.lead}>
        Enter your email and we&apos;ll send you a link to set a new password.
      </p>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">Email</label>
          <input
            id="email"
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <div className={styles.footer}>
        Remembered it? <Link href="/users/sign_in">Sign in</Link>
      </div>
    </div>
  );
}
