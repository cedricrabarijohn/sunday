"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { colorForId } from "@/lib/palette";
import styles from "./AppShell.module.scss";

export type WorkspacePage = "boards" | "members" | "integrations" | "settings";

const SUBTITLES: Record<WorkspacePage, string> = {
  boards: "Boards",
  members: "Members",
  integrations: "Integrations",
  settings: "Settings",
};

export default function WorkspacePageHeader({
  workspaceId,
  workspaceTitle,
  capabilities,
  currentPage,
  right,
}: {
  workspaceId: number;
  workspaceTitle: string | null;
  capabilities: string[];
  currentPage: WorkspacePage;
  /** Slot for page-specific content on the right (counters, indicators, …). */
  right?: ReactNode;
}) {
  const can = (c: string) => capabilities.includes(c);
  const wsColor = colorForId(workspaceId);

  const navItems: { page: WorkspacePage; label: string; show: boolean }[] = [
    { page: "boards",       label: "Boards",       show: true },
    { page: "members",      label: "Members",       show: true },
    { page: "integrations", label: "Integrations",  show: can("manage_members") },
    { page: "settings",     label: "Settings",      show: can("edit_workspace") },
  ];

  const href = (page: WorkspacePage) =>
    page === "boards"
      ? `/workspaces/${workspaceId}`
      : `/workspaces/${workspaceId}/${page}`;

  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        <span
          className={styles.pageBadge}
          style={{ background: wsColor.soft, color: wsColor.hue }}
        >
          {(workspaceTitle?.[0] || "W").toUpperCase()}
        </span>
        <div>
          <h1 className={styles.pageTitle}>{workspaceTitle || "Untitled"}</h1>
          <div className={styles.pageSubtitle}>{SUBTITLES[currentPage]}</div>
        </div>
      </div>

      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem" }}>
        {navItems
          .filter((item) => item.show && item.page !== currentPage)
          .map((item) => (
            <Link key={item.page} href={href(item.page)} className={styles.ghostBtn}>
              {item.label}
            </Link>
          ))}
        {right}
      </div>
    </div>
  );
}
