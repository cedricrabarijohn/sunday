"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./AuthForm.module.scss";

export default function SignUpForm() {
  const router = useRouter();
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstname, lastname, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create account");
        return;
      }
      router.push("/workspaces");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.brand}>sunday</div>
      <h1 className={styles.title}>Create your account</h1>

      <form className={styles.form} onSubmit={onSubmit}>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="firstname">First name</label>
            <input
              id="firstname"
              className={styles.input}
              value={firstname}
              onChange={(e) => setFirstname(e.target.value)}
              autoComplete="given-name"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="lastname">Last name</label>
            <input
              id="lastname"
              className={styles.input}
              value={lastname}
              onChange={(e) => setLastname(e.target.value)}
              autoComplete="family-name"
              required
            />
          </div>
        </div>
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
            autoComplete="new-password"
            minLength={8}
            placeholder="At least 8 characters"
            required
          />
        </div>
        <button className={styles.submit} type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className={styles.footer}>
        Already have an account?
        <Link href="/users/sign_in">Sign in</Link>
      </div>
    </div>
  );
}
