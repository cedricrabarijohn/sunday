"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import { colorForId } from "@/lib/palette";
import styles from "./AppShell.module.scss";

export type SidebarWorkspace = { id: number; title: string | null };
export type SidebarBoard = { id: number; title: string | null };

type Props = {
  user: { firstname: string | null; lastname: string | null; email: string | null };
  workspaces: SidebarWorkspace[];
  currentWorkspaceId?: number;
  currentBoardId?: number;
  workspaceBoards?: SidebarBoard[];
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
  children,
}: Props) {
  const router = useRouter();

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
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <Link href="/workspaces" className={styles.brand}>sunday</Link>
        </div>

        <div className={styles.sidebarScroll}>
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

        <div className={styles.sidebarFoot}>
          <span className={styles.avatar}>{initials(user)}</span>
          <div className={styles.userBlock}>
            <div className={styles.userName}>{name}</div>
            <div className={styles.userEmail}>{user.email}</div>
          </div>
          <button className={styles.iconBtn} onClick={onLogout} type="button" aria-label="Sign out">
            ⏻
          </button>
        </div>
      </aside>

      <div className={styles.content}>
        <main className={`${styles.main} ${styles.fadeIn}`}>{children}</main>
      </div>
    </div>
  );
}
