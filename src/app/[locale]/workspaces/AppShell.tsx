"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import styles from "./AppShell.module.scss";

export type Crumb = { label: string; href?: string };

type Props = {
  user: { firstname: string | null; lastname: string | null; email: string | null };
  crumbs?: Crumb[];
  children: ReactNode;
};

function initials(user: Props["user"]) {
  const f = user.firstname?.[0] ?? "";
  const l = user.lastname?.[0] ?? "";
  if (f || l) return (f + l).toUpperCase();
  return (user.email?.[0] ?? "?").toUpperCase();
}

export default function AppShell({ user, crumbs = [], children }: Props) {
  const router = useRouter();

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/users/sign_in");
  }

  const name = user.firstname || user.email?.split("@")[0] || "Account";

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href="/workspaces" className={styles.brand}>sunday</Link>
          <div className={styles.account}>
            <span className={styles.avatar}>{initials(user)}</span>
            <span>{name}</span>
            <button className={styles.logout} onClick={onLogout} type="button">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {crumbs.length > 0 && (
        <nav className={styles.crumbs}>
          <div className={styles.crumbsInner}>
            <Link href="/workspaces">Workspaces</Link>
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <span className={styles.crumbSep}>/</span>
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </div>
        </nav>
      )}

      <main className={`${styles.main} ${styles.fadeIn}`}>{children}</main>
    </div>
  );
}
