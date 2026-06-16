"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/organisms/confirm-dialog/ConfirmDialog";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import { colorForId } from "@/lib/palette";
import appStyles from "../../AppShell.module.scss";
import styles from "./WorkspaceSettings.module.scss";

export default function WorkspaceSettingsClient({
  workspaceId,
  workspaceTitle,
  capabilities,
}: {
  workspaceId: number;
  workspaceTitle: string | null;
  capabilities: string[];
}) {
  const caps = new Set(capabilities);
  const can = (c: string) => caps.has(c);
  const router = useRouter();
  const toast = useToast();
  const { confirm } = useConfirm();

  const [title, setTitle] = useState(workspaceTitle ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = title.trim() !== (workspaceTitle ?? "").trim() && title.trim().length > 0;

  const wsColor = colorForId(workspaceId);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not rename workspace");
        return;
      }
      toast.success("Workspace renamed");
      router.refresh();
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: `Delete "${workspaceTitle || "Untitled"}"?`,
      message:
        "This will permanently delete the workspace and all its boards, cards, and content. This cannot be undone.",
      confirmLabel: "Delete workspace",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Could not delete workspace");
        return;
      }
      router.push("/");
    } catch {
      toast.error("Network error.");
    }
  }

  return (
    <>
      <div className={appStyles.pageHeader}>
        <div className={appStyles.pageHeaderText}>
          <span
            className={appStyles.pageBadge}
            style={{ background: wsColor.soft, color: wsColor.hue }}
          >
            {(workspaceTitle?.[0] || "W").toUpperCase()}
          </span>
          <div>
            <h1 className={appStyles.pageTitle}>{workspaceTitle || "Untitled"}</h1>
            <div className={appStyles.pageSubtitle}>Settings</div>
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem" }}>
          <Link href={`/workspaces/${workspaceId}`} className={appStyles.ghostBtn}>
            Boards
          </Link>
          <Link href={`/workspaces/${workspaceId}/members`} className={appStyles.ghostBtn}>
            Members
          </Link>
          {can("manage_members") && (
            <Link href={`/workspaces/${workspaceId}/integrations`} className={appStyles.ghostBtn}>
              Integrations
            </Link>
          )}
        </div>
      </div>

      <div className={styles.wrap}>
        {can("edit_workspace") && (
          <form className={styles.card} onSubmit={onSave}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>General</h2>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="wsTitle">Workspace name</label>
              <input
                id="wsTitle"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                required
              />
            </div>

            <div className={styles.actions}>
              <button
                type="submit"
                className={styles.primary}
                disabled={!dirty || saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        )}

        {can("delete_workspace") && (
          <div className={styles.dangerCard}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Danger zone</h2>
            </div>

            <div className={styles.dangerRow}>
              <div className={styles.dangerText}>
                <p className={styles.dangerTitle}>Delete this workspace</p>
                <p className={styles.dangerDesc}>
                  Permanently deletes the workspace and all its boards, cards and content.
                  This action cannot be undone.
                </p>
              </div>
              <button type="button" className={styles.dangerBtn} onClick={onDelete}>
                Delete workspace
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
