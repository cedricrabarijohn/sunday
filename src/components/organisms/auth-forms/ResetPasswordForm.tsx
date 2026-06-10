"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "./AuthForm.module.scss";

export default function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not reset your password.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/users/sign_in"), 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.brand}>sunday</div>
        <h1 className={styles.title}>Invalid link</h1>
        <p className={styles.lead}>This reset link is missing its token.</p>
        <div className={styles.footer}>
          <Link href="/users/forgot_password">Request a new link</Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.card}>
        <div className={styles.brand}>sunday</div>
        <h1 className={styles.title}>Password updated</h1>
        <p className={styles.lead}>Taking you to sign in…</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.brand}>sunday</div>
      <h1 className={styles.title}>Choose a new password</h1>
      <form className={styles.form} onSubmit={onSubmit}>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">New password</label>
          <input
            id="password"
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            className={styles.input}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            required
          />
        </div>
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
