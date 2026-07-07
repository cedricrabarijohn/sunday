"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DownloadIcon, PlugIcon, SettingsIcon, TableIcon, UsersIcon } from "@/components/Icons";
import kStyles from "./Kanban.module.scss";

export function BoardActionsMenu({
  boardId,
  workspaceId,
  canManageMembers,
}: {
  boardId: number;
  workspaceId: number;
  canManageMembers: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Export mirrors what's on screen: forward the board's active filter params
  // (persisted in the URL) so the file matches the current filtered view.
  const triggerExport = (format: "md" | "docx") => {
    const current = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();
    for (const [k, v] of current) {
      if (["q", "assignees", "labels", "due"].includes(k) || /^cf\d+$/.test(k)) params.set(k, v);
    }
    params.set("format", format);
    const a = document.createElement("a");
    a.href = `/api/boards/${boardId}/export?${params.toString()}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: {
    href: string;
    label: string;
    sub: string;
    icon: ReactNode;
    show: boolean;
  }[] = [
    {
      href: `/boards/${boardId}/settings`,
      label: "Board settings",
      sub: "Rename or delete this board",
      icon: <SettingsIcon size={16} />,
      show: true,
    },
    {
      href: `/boards/${boardId}/fields`,
      label: "Custom fields",
      sub: "Add and configure card fields",
      icon: <TableIcon size={16} />,
      show: true,
    },
    {
      href: `/boards/${boardId}/members`,
      label: "Members",
      sub: "Who can see this board",
      icon: <UsersIcon size={16} />,
      show: true,
    },
    {
      href: `/workspaces/${workspaceId}/integrations`,
      label: "Integrations",
      sub: "Connect Gitea & more",
      icon: <PlugIcon size={16} />,
      show: canManageMembers,
    },
  ];

  return (
    <div className={kStyles.filterWrap} ref={wrapRef}>
      <button
        type="button"
        className={kStyles.filterBtn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <SettingsIcon size={14} />
        <span>Manage</span>
      </button>
      {open && (
        <div className={kStyles.actionsMenu} role="menu">
          {items
            .filter((it) => it.show)
            .map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={kStyles.actionItem}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span className={kStyles.actionIcon}>{it.icon}</span>
                <span className={kStyles.actionText}>
                  <span className={kStyles.actionLabel}>{it.label}</span>
                  <span className={kStyles.actionSub}>{it.sub}</span>
                </span>
              </Link>
            ))}
          <div className={kStyles.actionDivider} role="separator" />
          {(
            [
              { format: "md", label: "Export as Markdown", sub: "Download this board as a .md file" },
              { format: "docx", label: "Export as Word", sub: "Download this board as a .docx file" },
            ] as const
          ).map((it) => (
            <button
              key={it.format}
              type="button"
              className={`${kStyles.actionItem} ${kStyles.actionButton}`}
              role="menuitem"
              onClick={() => triggerExport(it.format)}
            >
              <span className={kStyles.actionIcon}>
                <DownloadIcon size={16} />
              </span>
              <span className={kStyles.actionText}>
                <span className={kStyles.actionLabel}>{it.label}</span>
                <span className={kStyles.actionSub}>{it.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
