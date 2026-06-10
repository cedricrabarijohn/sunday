"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { colorForId } from "@/lib/palette";
import NotificationsBell from "./NotificationsBell";
import styles from "./AppShell.module.scss";

export type SidebarWorkspace = { id: number; title: string | null };
export type SidebarBoard = { id: number; title: string | null };

type Props = {
  user: { firstname: string | null; lastname: string | null; email: string | null };
  workspaces: SidebarWorkspace[];
  currentWorkspaceId?: number;
  currentBoardId?: number;
  workspaceBoards?: SidebarBoard[];
  wide?: boolean;
  children: ReactNode;
};

function initials(user: Props["user"]) {
  const f = user.firstname?.[0] ?? "";
  const l = user.lastname?.[0] ?? "";
  if (f || l) return (f + l).toUpperCase();
  return (user.email?.[0] ?? "?").toUpperCase();
}

export default function AppShell({
  user,
  workspaces,
  currentWorkspaceId,
  currentBoardId,
  workspaceBoards = [],
  wide = false,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // Close the mobile drawer on route change. Resetting on navigation is the
  // intended behavior here, not a cascading-render bug.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [pathname]);

  // Close the account menu on outside click or Escape
  useEffect(() => {
    if (!accountOpen) return;
    const onDown = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [accountOpen]);

  // Esc to close on mobile
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/users/sign_in");
  }

  const name =
    [user.firstname, user.lastname].filter(Boolean).join(" ") ||
    user.email?.split("@")[0] ||
    "Account";

  return (
    <div className={styles.shell}>
      <header className={styles.mobileBar}>
        <button
          type="button"
          className={styles.menuBtn}
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <span className={styles.menuIcon}>☰</span>
        </button>
        <Link href="/workspaces" className={styles.brand}>sunday</Link>
        <span className={styles.avatar} aria-hidden>{initials(user)}</span>
      </header>

      <button
        type="button"
        className={`${styles.mobileBackdrop} ${mobileOpen ? styles.mobileBackdropOpen : ""}`}
        aria-label="Close menu"
        onClick={() => setMobileOpen(false)}
        tabIndex={mobileOpen ? 0 : -1}
      />

      <aside
        className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}
        aria-hidden={!mobileOpen ? undefined : false}
      >
        <div className={styles.sidebarTop}>
          <Link href="/workspaces" className={styles.brand}>sunday</Link>
          <button
            type="button"
            className={styles.sidebarClose}
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className={styles.sidebarScroll}>
          <div className={styles.section}>
            <Link href="/me/cards" className={styles.navItem}>
              <span className={styles.navIcon} aria-hidden>◷</span>
              <span className={styles.navLabel}>My cards</span>
            </Link>
          </div>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionLabel}>Workspaces</span>
              <Link href="/workspaces" className={styles.sectionAdd} aria-label="All workspaces">
                ⊞
              </Link>
            </div>
            {workspaces.length === 0 ? (
              <Link href="/workspaces" className={styles.navItem}>
                <span className={styles.navLabel} style={{ color: "var(--text-mute)" }}>
                  No workspaces
                </span>
              </Link>
            ) : (
              workspaces.map((w) => {
                const c = colorForId(w.id);
                const isActive = currentWorkspaceId === w.id;
                return (
                  <div key={w.id}>
                    <Link
                      href={`/workspaces/${w.id}`}
                      className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
                    >
                      <span className={styles.dotMark} style={{ background: c.hue }} />
                      <span className={styles.navLabel}>{w.title || "Untitled"}</span>
                    </Link>
                    {isActive && workspaceBoards.length > 0 && (
                      <div className={styles.subNav}>
                        {workspaceBoards.map((b) => (
                          <Link
                            key={b.id}
                            href={`/boards/${b.id}`}
                            className={`${styles.subNavItem} ${currentBoardId === b.id ? styles.subNavItemActive : ""}`}
                          >
                            <span className={styles.subNavBullet} />
                            <span className={styles.navLabel}>{b.title || "Untitled"}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={styles.sidebarFoot} ref={accountRef}>
          {accountOpen && (
            <div className={styles.accountMenu} role="menu">
              <Link
                href="/me/settings"
                className={styles.accountItem}
                role="menuitem"
                onClick={() => setAccountOpen(false)}
              >
                Account settings
              </Link>
              <button
                type="button"
                className={`${styles.accountItem} ${styles.accountItemDanger}`}
                role="menuitem"
                onClick={onLogout}
              >
                Sign out
              </button>
            </div>
          )}
          <button
            type="button"
            className={styles.accountTrigger}
            onClick={() => setAccountOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
          >
            <span className={styles.avatar}>{initials(user)}</span>
            <div className={styles.userBlock}>
              <div className={styles.userName}>{name}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
            <span className={styles.accountCaret} aria-hidden>⌄</span>
          </button>
        </div>
      </aside>

      <div className={styles.content}>
        <main
          className={`${wide ? styles.mainWide : styles.main} ${styles.fadeIn}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
