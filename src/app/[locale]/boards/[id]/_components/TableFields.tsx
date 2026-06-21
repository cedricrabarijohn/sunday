"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colorForName, PALETTE } from "@/lib/palette";
import type { FieldType, SelectOption } from "@/lib/fields";
import type { BoardColumn, FieldValue } from "./TasksClient";
import styles from "../_styles/Table.module.scss";

/** Types a user can create from the table UI (multi_select shows read-only). */
const CREATABLE: { type: FieldType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "select", label: "Select" },
  { type: "date", label: "Date" },
  { type: "checkbox", label: "Checkbox" },
  { type: "url", label: "Link" },
];

function optionById(col: BoardColumn, id: string): SelectOption | undefined {
  return col.config?.options?.find((o) => o.id === id);
}

function Chip({ opt }: { opt: SelectOption | undefined }) {
  if (!opt) return null;
  const c = colorForName(opt.color ?? "slate");
  return (
    <span className={styles.fieldChip} style={{ background: c.soft, color: c.hue }}>
      {opt.label}
    </span>
  );
}

/** A single editable (or read-only) cell for a card's custom-field value. */
export function FieldCell({
  col,
  value,
  editable,
  onChange,
}: {
  col: BoardColumn;
  value: FieldValue;
  editable: boolean;
  onChange: (v: FieldValue) => void;
}) {
  const type = col.type;

  if (type === "multi_select") {
    const ids = Array.isArray(value) ? value : [];
    return (
      <div className={styles.fieldChips}>
        {ids.map((id) => (
          <Chip key={id} opt={optionById(col, id)} />
        ))}
      </div>
    );
  }

  if (!editable) {
    if (type === "select") return <Chip opt={typeof value === "string" ? optionById(col, value) : undefined} />;
    if (type === "checkbox") return <span className={styles.mute}>{value === true ? "✓" : "—"}</span>;
    return <span className={styles.fieldRO}>{value == null ? "" : String(value)}</span>;
  }

  switch (type) {
    case "checkbox":
      return (
        <input
          type="checkbox"
          className={styles.fieldCheckbox}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "date":
      return (
        <input
          type="date"
          className={styles.fieldInput}
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "select": {
      const opts = col.config?.options ?? [];
      return (
        <select
          className={styles.fieldSelect}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case "number":
      return (
        <input
          type="number"
          className={styles.fieldInput}
          defaultValue={typeof value === "number" ? String(value) : ""}
          onBlur={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      );
    default: // text, url
      return (
        <input
          type={type === "url" ? "url" : "text"}
          className={styles.fieldInput}
          defaultValue={typeof value === "string" ? value : ""}
          placeholder={type === "url" ? "https://…" : ""}
          onBlur={(e) => onChange(e.target.value || null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      );
  }
}

/** Header cell for a custom field: rename inline + delete when allowed. */
export function FieldHeaderCell({
  col,
  editBoard,
  onRename,
  onDelete,
}: {
  col: BoardColumn;
  editBoard: boolean;
  onRename: (id: number, label: string) => void;
  onDelete: (id: number) => void;
}) {
  if (!editBoard) {
    return <th className={styles.colField}>{col.label}</th>;
  }
  return (
    <th className={styles.colField}>
      <span className={styles.fieldHead}>
        <input
          className={styles.fieldHeadInput}
          defaultValue={col.label ?? ""}
          aria-label="Field name"
          maxLength={60}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== col.label) onRename(col.id, v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <button
          type="button"
          className={styles.fieldHeadDelete}
          aria-label="Delete field"
          title="Delete field"
          onClick={() => onDelete(col.id)}
        >
          ×
        </button>
      </span>
    </th>
  );
}

/** "+ Add field" header that opens a small create form in a portal. */
export function AddFieldCell({
  onCreate,
}: {
  onCreate: (input: { label: string; type: FieldType; config?: { options: SelectOption[] } }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 260;
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
    setOpen(true);
  };

  const submit = () => {
    const name = label.trim();
    if (!name) return;
    let config: { options: SelectOption[] } | undefined;
    if (type === "select") {
      const options = optionsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l, i) => ({ id: "", label: l, color: PALETTE[i % PALETTE.length].name }));
      config = { options };
    }
    onCreate({ label: name, type, config });
    setLabel("");
    setOptionsText("");
    setType("text");
    setOpen(false);
  };

  return (
    <th className={styles.colAddField}>
      <button
        ref={btnRef}
        type="button"
        className={styles.addFieldBtn}
        onClick={toggle}
        aria-label="Add field"
        title="Add field"
      >
        +
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.addFieldForm}
            style={{ top: pos.top, left: pos.left } as CSSProperties}
            role="dialog"
          >
            <input
              className={styles.addFieldInput}
              placeholder="Field name"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
              maxLength={60}
            />
            <select
              className={styles.addFieldSelect}
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
            >
              {CREATABLE.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
            {type === "select" && (
              <textarea
                className={styles.addFieldOptions}
                placeholder="Options, one per line"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={3}
              />
            )}
            <div className={styles.addFieldActions}>
              <button type="button" className={styles.addFieldCancel} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className={styles.addFieldCreate} onClick={submit} disabled={!label.trim()}>
                Add field
              </button>
            </div>
          </div>,
          document.body,
        )}
    </th>
  );
}
