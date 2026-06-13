"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/organisms/confirm-dialog/ConfirmDialog";
import { colorForId } from "@/lib/palette";
import { BackIcon, TableIcon, TrashIcon, UsersIcon } from "@/components/Icons";
import shellStyles from "../../../workspaces/AppShell.module.scss";
import styles from "./BoardSettings.module.scss";
import { useToast } from "@/components/organisms/toast/ToastProvider";

export default function BoardSettingsClient({
  boardId,
  boardTitle,
  workspaceId,
  workspaceTitle,
  capabilities,
}: {
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
  capabilities: string[];
}) {
  const caps = new Set(capabilities);
  const canEdit = caps.has("edit_board");
  const canDelete = caps.has("delete_board");
  const router = useRouter();
  const { confirm } = useConfirm();
  const toast = useToast();

  const [title, setTitle] = useState(boardTitle || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    const next = title.trim();
    if (!next) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Could not save the board name");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    } catch {
      toast.error("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteBoard = async () => {
    const ok = await confirm({
      title: `Delete "${boardTitle || "this board"}"?`,
      message:
        "This will permanently delete the board with every pile, card, sub-task, attachment and comment inside it. This can't be undone.",
      confirmLabel: "Delete board",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/boards/${boardId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Could not delete the board");
        return;
      }
      router.push(`/workspaces/${workspaceId}`);
    } catch {
      toast.error("Network error.");
    }
  };

  const bdColor = colorForId(boardId);

  return (
    <>
      <div className={shellStyles.pageHeader}>
        <div className={shellStyles.pageHeaderText}>
          <span
            className={shellStyles.pageBadge}
            style={{ background: bdColor.soft, color: bdColor.hue }}
          >
            {(boardTitle?.[0] || "B").toUpperCase()}
          </span>
          <div>
            <h1 className={shellStyles.pageTitle}>{boardTitle || "Untitled board"}</h1>
            <div className={shellStyles.pageSubtitle}>
              <Link href={`/boards/${boardId}`} className={styles.crumb}>
                <BackIcon size={12} /> Back to the board
              </Link>
              <span style={{ opacity: 0.5, margin: "0 0.4rem" }}>·</span>
              in{" "}
              <Link href={`/workspaces/${workspaceId}`} className={styles.crumb}>
                {workspaceTitle || "workspace"}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>General</h2>
        </header>
        <form className={styles.form} onSubmit={onSave}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Board name</span>
            <input
              type="text"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              disabled={!canEdit || saving}
              placeholder="Board name"
            />
          </label>
          {canEdit && (
            <div className={styles.fieldActions}>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={!title.trim() || saving}
              >
                {saving ? "Saving…" : saved ? "Saved" : "Save"}
              </button>
            </div>
          )}
        </form>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Access</h2>
        </header>
        <Link href={`/boards/${boardId}/members`} className={styles.rowLink}>
          <UsersIcon size={18} />
          <div className={styles.rowLinkText}>
            <div className={styles.rowLinkTitle}>Members</div>
            <div className={styles.rowLinkSub}>
              Manage who can see this board and invite new people.
            </div>
          </div>
        </Link>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Customize</h2>
        </header>
        <Link href={`/boards/${boardId}/fields`} className={styles.rowLink}>
          <TableIcon size={18} />
          <div className={styles.rowLinkText}>
            <div className={styles.rowLinkTitle}>Custom fields</div>
            <div className={styles.rowLinkSub}>
              Add and configure the typed columns that appear on cards and in the table.
            </div>
          </div>
        </Link>
      </section>

      {canDelete && (
        <section className={`${styles.section} ${styles.danger}`}>
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Danger zone</h2>
          </header>
          <div className={styles.dangerCard}>
            <div className={styles.dangerText}>
              <div className={styles.dangerTitle}>Delete this board</div>
              <div className={styles.dangerSub}>
                Permanently removes the board and everything inside it. There is no undo.
              </div>
            </div>
            <button
              type="button"
              className={styles.btnDanger}
              onClick={onDeleteBoard}
            >
              <TrashIcon size={14} />
              <span>Delete board</span>
            </button>
          </div>
        </section>
      )}
    </>
  );
}
