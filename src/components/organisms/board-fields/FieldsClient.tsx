"use client";

import { useState } from "react";
import Link from "next/link";
import { BackIcon, TrashIcon } from "@/components/Icons";
import { PALETTE, colorForId, colorForName } from "@/lib/palette";
import { FIELD_TYPES, type FieldConfig, type FieldType, type SelectOption } from "@/lib/fields";
import { useConfirm } from "@/components/organisms/confirm-dialog/ConfirmDialog";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import shellStyles from "@/components/organisms/workspaces/AppShell.module.scss";
import styles from "./Fields.module.scss";

type Column = {
  id: number;
  label: string | null;
  type: FieldType | string | null;
  config: FieldConfig;
  position: number | null;
};

const TYPE_LABEL: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  select: "Select",
  multi_select: "Multi-select",
  date: "Date",
  checkbox: "Checkbox",
  url: "Link",
};

const hasOptions = (t: Column["type"]) => t === "select" || t === "multi_select";

export default function FieldsClient({
  boardId,
  boardTitle,
  workspaceId,
  workspaceTitle,
  capabilities,
  initialColumns,
}: {
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
  capabilities: string[];
  initialColumns: Column[];
}) {
  const canEdit = capabilities.includes("edit_board");
  const { confirm } = useConfirm();
  const toast = useToast();
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [newOptions, setNewOptions] = useState("");
  const [creating, setCreating] = useState(false);

  const bdColor = colorForId(boardId);

  async function patchColumn(id: number, body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`/api/columns/${id}`, {
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

  const renameField = async (col: Column, label: string) => {
    const next = label.trim();
    if (!next || next === col.label) return;
    const snap = columns;
    setColumns((prev) => prev.map((c) => (c.id === col.id ? { ...c, label: next } : c)));
    if (!(await patchColumn(col.id, { label: next }))) setColumns(snap);
  };

  const saveOptions = async (col: Column, options: SelectOption[]) => {
    const snap = columns;
    setColumns((prev) =>
      prev.map((c) => (c.id === col.id ? { ...c, config: { options } } : c)),
    );
    if (!(await patchColumn(col.id, { config: { options } }))) setColumns(snap);
  };

  const addOption = (col: Column) => {
    const opts = col.config?.options ?? [];
    const color = PALETTE[opts.length % PALETTE.length].name;
    saveOptions(col, [...opts, { id: "", label: "New option", color }]);
  };
  const updateOptionLabel = (col: Column, idx: number, label: string) => {
    const opts = [...(col.config?.options ?? [])];
    if (!opts[idx]) return;
    opts[idx] = { ...opts[idx], label };
    saveOptions(col, opts);
  };
  const setOptionColor = (col: Column, idx: number, color: string) => {
    const opts = [...(col.config?.options ?? [])];
    if (!opts[idx]) return;
    opts[idx] = { ...opts[idx], color };
    saveOptions(col, opts);
  };
  const removeOption = (col: Column, idx: number) => {
    const opts = (col.config?.options ?? []).filter((_, i) => i !== idx);
    saveOptions(col, opts);
  };

  const move = async (col: Column, dir: -1 | 1) => {
    const ordered = [...columns];
    const i = ordered.findIndex((c) => c.id === col.id);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    const snap = columns;
    setColumns(ordered.map((c, idx) => ({ ...c, position: idx + 1 })));
    // Persist the two swapped fields' new positions.
    const okA = await patchColumn(ordered[i].id, { position: i + 1 });
    const okB = await patchColumn(ordered[j].id, { position: j + 1 });
    if (!okA || !okB) setColumns(snap);
  };

  const deleteField = async (col: Column) => {
    const ok = await confirm({
      title: `Delete "${col.label || "this field"}"?`,
      message: "The field and every value cards hold for it will be removed. This can't be undone.",
      confirmLabel: "Delete field",
      danger: true,
    });
    if (!ok) return;
    const snap = columns;
    setColumns((prev) => prev.filter((c) => c.id !== col.id));
    try {
      const res = await fetch(`/api/columns/${col.id}`, { method: "DELETE" });
      if (!res.ok) {
        setColumns(snap);
        toast.error("Could not delete the field");
      }
    } catch {
      setColumns(snap);
      toast.error("Network error.");
    }
  };

  const createField = async () => {
    const label = newLabel.trim();
    if (!label) return;
    let config: { options: SelectOption[] } | undefined;
    if (hasOptions(newType)) {
      const options = newOptions
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l, i) => ({ id: "", label: l, color: PALETTE[i % PALETTE.length].name }));
      config = { options };
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, type: newType, config }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Could not create the field");
        return;
      }
      setColumns((prev) => [...prev, data.column as Column]);
      setNewLabel("");
      setNewOptions("");
      setNewType("text");
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
            <h1 className={shellStyles.pageTitle}>Custom fields</h1>
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

      {!canEdit && (
        <div className={styles.note}>
          You can view this board&apos;s fields but need the <strong>edit board</strong> permission to
          change them.
        </div>
      )}

      <section className={styles.list}>
        {columns.length === 0 && (
          <div className={styles.empty}>
            No custom fields yet. {canEdit ? "Add one below." : ""}
          </div>
        )}

        {columns.map((col, i) => (
          <div className={styles.fieldCard} key={col.id}>
            <div className={styles.fieldTop}>
              {canEdit && (
                <div className={styles.reorder}>
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(col, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === columns.length - 1}
                    onClick={() => move(col, 1)}
                  >
                    ↓
                  </button>
                </div>
              )}
              {canEdit ? (
                <input
                  className={styles.nameInput}
                  defaultValue={col.label ?? ""}
                  maxLength={60}
                  aria-label="Field name"
                  onBlur={(e) => renameField(col, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
              ) : (
                <span className={styles.nameStatic}>{col.label}</span>
              )}
              <span className={styles.typeBadge}>{TYPE_LABEL[col.type as FieldType] ?? col.type}</span>
              {canEdit && (
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => deleteField(col)}
                  aria-label="Delete field"
                  title="Delete field"
                >
                  <TrashIcon size={15} />
                </button>
              )}
            </div>

            {hasOptions(col.type) && (
              <div className={styles.options}>
                {(col.config?.options ?? []).map((opt, idx) => {
                  const c = colorForName(opt.color ?? "slate");
                  return (
                    <div className={styles.optionRow} key={`${col.id}-${idx}`}>
                      <span className={styles.optDot} style={{ background: c.hue }} aria-hidden />
                      {canEdit ? (
                        <input
                          className={styles.optInput}
                          defaultValue={opt.label}
                          maxLength={60}
                          aria-label="Option label"
                          onBlur={(e) => updateOptionLabel(col, idx, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      ) : (
                        <span
                          className={styles.optChip}
                          style={{ background: c.soft, color: c.hue }}
                        >
                          {opt.label}
                        </span>
                      )}
                      {canEdit && (
                        <>
                          <div className={styles.swatches}>
                            {PALETTE.map((p) => (
                              <button
                                key={p.name}
                                type="button"
                                className={`${styles.swatch} ${opt.color === p.name ? styles.swatchOn : ""}`}
                                style={{ background: p.hue }}
                                aria-label={`Color ${p.name}`}
                                title={p.name}
                                onClick={() => setOptionColor(col, idx, p.name)}
                              />
                            ))}
                          </div>
                          <button
                            type="button"
                            className={styles.optRemove}
                            aria-label="Remove option"
                            onClick={() => removeOption(col, idx)}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
                {canEdit && (
                  <button type="button" className={styles.addOption} onClick={() => addOption(col)}>
                    + Add option
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </section>

      {canEdit && (
        <section className={styles.createCard}>
          <h2 className={styles.createTitle}>Add a field</h2>
          <div className={styles.createForm}>
            <input
              className={styles.input}
              placeholder="Field name"
              value={newLabel}
              maxLength={60}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <select
              className={styles.select}
              value={newType}
              onChange={(e) => setNewType(e.target.value as FieldType)}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            {hasOptions(newType) && (
              <textarea
                className={styles.textarea}
                placeholder="Options, one per line"
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                rows={3}
              />
            )}
            <div className={styles.createActions}>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!newLabel.trim() || creating}
                onClick={createField}
              >
                {creating ? "Adding…" : "Add field"}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
