"use client";

import { useState } from "react";
import Link from "next/link";
import { BackIcon, TrashIcon } from "@/components/Icons";
import { PALETTE, colorForId, colorForName } from "@/lib/palette";
import { useConfirm } from "@/components/organisms/confirm-dialog/ConfirmDialog";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import shellStyles from "@/components/organisms/workspaces/AppShell.module.scss";
import styles from "./Labels.module.scss";

type Label = {
  id: number;
  title: string;
  color: string;
  description: string | null;
  position: number | null;
  isDefault: number;
};

export default function LabelsClient({
  boardId,
  boardTitle,
  workspaceId,
  workspaceTitle,
  canManage,
  initialLabels,
}: {
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
  canManage: boolean;
  initialLabels: Label[];
}) {
  const { confirm } = useConfirm();
  const toast = useToast();
  const [labels, setLabels] = useState<Label[]>(initialLabels);
  const [newTitle, setNewTitle] = useState("");
  const [newColor, setNewColor] = useState<string>(PALETTE[0].name);
  const [creating, setCreating] = useState(false);

  const bdColor = colorForId(boardId);

  async function patchLabel(id: number, body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`/api/labels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Could not save");
        return false;
      }
      return true;
    } catch {
      toast.error("Network error.");
      return false;
    }
  }

  const renameLabel = async (label: Label, title: string) => {
    const next = title.trim();
    if (!next || next === label.title) return;
    const snap = labels;
    setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, title: next } : l)));
    if (!(await patchLabel(label.id, { title: next }))) setLabels(snap);
  };

  const setLabelColor = async (label: Label, color: string) => {
    if (color === label.color) return;
    const snap = labels;
    setLabels((prev) => prev.map((l) => (l.id === label.id ? { ...l, color } : l)));
    if (!(await patchLabel(label.id, { color }))) setLabels(snap);
  };

  const deleteLabel = async (label: Label) => {
    const ok = await confirm({
      title: `Delete "${label.title}"?`,
      message: "It will be removed from every card in this workspace. This can't be undone.",
      confirmLabel: "Delete label",
      danger: true,
    });
    if (!ok) return;
    const snap = labels;
    setLabels((prev) => prev.filter((l) => l.id !== label.id));
    try {
      const res = await fetch(`/api/labels/${label.id}`, { method: "DELETE" });
      if (!res.ok) {
        setLabels(snap);
        toast.error("Could not delete the label");
      }
    } catch {
      setLabels(snap);
      toast.error("Network error.");
    }
  };

  const createLabel = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, color: newColor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not create the label");
        return;
      }
      setLabels((prev) => [...prev, data.label as Label]);
      setNewTitle("");
      setNewColor(PALETTE[0].name);
    } catch {
      toast.error("Network error.");
    } finally {
      setCreating(false);
    }
  };

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
            <h1 className={shellStyles.pageTitle}>Labels</h1>
            <div className={shellStyles.pageSubtitle}>
              <Link href={`/boards/${boardId}`} className={styles.crumb}>
                <BackIcon size={12} /> Back to the board
              </Link>
              <span style={{ opacity: 0.5, margin: "0 0.4rem" }}>·</span>
              {boardTitle || "Untitled board"} in{" "}
              <Link href={`/workspaces/${workspaceId}`} className={styles.crumb}>
                {workspaceTitle || "workspace"}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.note}>
        Labels are shared across every board in{" "}
        <strong>{workspaceTitle || "this workspace"}</strong>.
        {!canManage && (
          <>
            {" "}
            You can view them but need the <strong>manage labels</strong> permission to change them.
          </>
        )}
      </div>

      <section className={styles.list}>
        {labels.length === 0 && (
          <div className={styles.empty}>
            No labels yet. {canManage ? "Create one below." : ""}
          </div>
        )}

        {labels.map((label) => {
          const c = colorForName(label.color ?? "slate");
          return (
            <div className={styles.labelCard} key={label.id}>
              <div className={styles.labelTop}>
                <span
                  className={styles.chip}
                  style={{ background: c.soft, color: c.hue }}
                >
                  <span className={styles.chipDot} style={{ background: c.hue }} aria-hidden />
                  {label.title}
                </span>
                {canManage ? (
                  <input
                    className={styles.nameInput}
                    defaultValue={label.title}
                    maxLength={50}
                    aria-label="Label name"
                    onBlur={(e) => renameLabel(label, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                ) : (
                  <span className={styles.nameStatic}>{label.title}</span>
                )}
                {canManage && (
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => deleteLabel(label)}
                    aria-label="Delete label"
                    title="Delete label"
                  >
                    <TrashIcon size={15} />
                  </button>
                )}
              </div>

              {canManage && (
                <div className={styles.swatches}>
                  {PALETTE.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      className={`${styles.swatch} ${label.color === p.name ? styles.swatchOn : ""}`}
                      style={{ background: p.hue }}
                      aria-label={`Color ${p.name}`}
                      title={p.name}
                      onClick={() => setLabelColor(label, p.name)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {canManage && (
        <section className={styles.createCard}>
          <h2 className={styles.createTitle}>Add a label</h2>
          <div className={styles.createForm}>
            <input
              className={styles.input}
              placeholder="Label name"
              value={newTitle}
              maxLength={50}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createLabel();
              }}
            />
            <div className={styles.swatches}>
              {PALETTE.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={`${styles.swatch} ${newColor === p.name ? styles.swatchOn : ""}`}
                  style={{ background: p.hue }}
                  aria-label={`Color ${p.name}`}
                  title={p.name}
                  onClick={() => setNewColor(p.name)}
                />
              ))}
            </div>
            <div className={styles.createActions}>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!newTitle.trim() || creating}
                onClick={createLabel}
              >
                {creating ? "Adding…" : "Add label"}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
