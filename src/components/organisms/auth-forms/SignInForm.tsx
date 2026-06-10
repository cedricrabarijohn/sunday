"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "./AuthForm.module.scss";

/** Only redirect to in-app paths to avoid open-redirect attacks. */
function safeRedirect(raw: string | null): string {
  if (!raw) return "/workspaces";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/workspaces";
  return raw;
}

export default function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = safeRedirect(searchParams.get("redirect"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid email or password");
        return;
      }
      router.push(redirect);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.brand}>sunday</div>
      <h1 className={styles.title}>Sign in to your account</h1>

      <form className={styles.form} onSubmit={onSubmit}>
        {error && <div className={styles.error}>{error}</div>}
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
        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">Password</label>
          <input
            id="password"
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className={styles.subLink}>
        <Link href="/users/forgot_password">Forgot your password?</Link>
      </div>

      <div className={styles.footer}>
        Don&apos;t have an account?
        <Link
          href={`/users/sign_up${searchParams.get("redirect") ? `?redirect=${encodeURIComponent(searchParams.get("redirect") as string)}` : ""}`}
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
