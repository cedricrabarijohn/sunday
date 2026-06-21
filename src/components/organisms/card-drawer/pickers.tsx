"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { PALETTE, colorForName } from "@/lib/palette";
import styles from "./CardDrawer.module.scss";
import type { Assignee, WorkspaceLabel } from "./types";
import { initialsForAssignee, nameForAssignee } from "./format";

export function LabelsPicker({
  workspaceLabels,
  selected,
  canManage,
  onToggle,
  onCreate,
  onEdit,
  onDelete,
}: {
  workspaceLabels: WorkspaceLabel[];
  selected: Set<number>;
  canManage: boolean;
  onToggle: (l: WorkspaceLabel) => void;
  onCreate: (title: string, color: string) => Promise<void>;
  onEdit: (l: WorkspaceLabel, patch: Partial<WorkspaceLabel>) => Promise<void>;
  onDelete: (l: WorkspaceLabel) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newColor, setNewColor] = useState<string>(PALETTE[0].name);
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <div className={styles.picker}>
      <div className={styles.pickerList}>
        {workspaceLabels.length === 0 && (
          <div className={styles.pickerEmpty}>No labels in this workspace yet.</div>
        )}
        {workspaceLabels.map((l) =>
          editingId === l.id ? (
            <LabelEditor
              key={l.id}
              label={l}
              onCancel={() => setEditingId(null)}
              onSave={async (patch) => {
                await onEdit(l, patch);
                setEditingId(null);
              }}
              onDelete={async () => {
                await onDelete(l);
                setEditingId(null);
              }}
            />
          ) : (
            <div key={l.id} className={styles.pickerRow}>
              <button
                type="button"
                className={styles.pickerToggle}
                onClick={() => onToggle(l)}
                aria-pressed={selected.has(l.id)}
              >
                <span
                  className={`${styles.pickerCheck} ${selected.has(l.id) ? styles.pickerCheckOn : ""}`}
                  aria-hidden
                />
                <span
                  className={styles.labelChip}
                  style={{
                    background: colorForName(l.color).soft,
                    color: colorForName(l.color).hue,
                  }}
                >
                  <span
                    className={styles.labelDot}
                    style={{ background: colorForName(l.color).hue }}
                    aria-hidden
                  />
                  {l.title}
                </span>
              </button>
              {canManage && (
                <button
                  type="button"
                  className={styles.pickerEdit}
                  onClick={() => setEditingId(l.id)}
                  aria-label="Edit label"
                >
                  Edit
                </button>
              )}
            </div>
          ),
        )}
      </div>

      {!canManage ? null : creating ? (
        <LabelCreator
          color={newColor}
          title={newTitle}
          onTitleChange={setNewTitle}
          onColorChange={setNewColor}
          onCancel={() => {
            setCreating(false);
            setNewTitle("");
          }}
          onSave={async () => {
            await onCreate(newTitle, newColor);
            setCreating(false);
            setNewTitle("");
            setNewColor(PALETTE[0].name);
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.pickerCreate}
          onClick={() => setCreating(true)}
        >
          ＋ New label
        </button>
      )}
    </div>
  );
}

// A trigger that opens an editor in a popover, closing on an outside click
// or Escape. The trigger content is caller-supplied so it can be a gear, a
// row of avatar pips, label chips, etc.
export function MetaPopover({
  open,
  setOpen,
  label,
  trigger,
  triggerClassName,
  children,
  disabled = false,
}: {
  open: boolean;
  setOpen: (next: boolean) => void;
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled || !open) return;
    const onDown = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
  }, [open, setOpen, disabled]);

  // Read-only viewers still see the assignees/labels, just can't open the picker.
  if (disabled) {
    return (
      <div className={styles.popoverAnchor}>
        <span className={triggerClassName ?? styles.metaTrigger} aria-label={label} title={label}>
          {trigger}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.popoverAnchor} ref={anchorRef}>
      <button
        type="button"
        className={`${triggerClassName ?? styles.metaTrigger} ${open ? styles.metaTriggerActive : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        {trigger}
      </button>
      {open && (
        <div className={styles.popover} role="dialog">
          {children}
        </div>
      )}
    </div>
  );
}

export function CommentBody({
  body,
  directory,
  currentUserId,
}: {
  body: string;
  directory: Map<number, Assignee>;
  currentUserId?: number;
}) {
  if (!body) return null;
  const parts: Array<{ type: "text" | "mention"; value: string; userId?: number }> = [];
  const re = /<@(\d+)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", value: body.slice(last, m.index) });
    }
    parts.push({ type: "mention", value: m[0], userId: Number(m[1]) });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: "text", value: body.slice(last) });
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.value}</span>;
        const ref = p.userId != null ? directory.get(p.userId) : null;
        const isMe = p.userId != null && p.userId === currentUserId;
        const name = ref ? nameForAssignee(ref) : "unknown";
        return (
          <span
            key={i}
            className={isMe ? styles.mentionChipSelf : styles.mentionChip}
          >
            @{name}
          </span>
        );
      })}
    </>
  );
}

export function AssigneePicker({
  members,
  loading,
  selected,
  onToggle,
}: {
  members: Assignee[];
  loading: boolean;
  selected: Set<number>;
  onToggle: (member: Assignee) => void;
}) {
  if (loading) {
    return <div className={styles.pickerEmpty}>Loading board members…</div>;
  }
  if (members.length === 0) {
    return (
      <div className={styles.pickerEmpty}>
        No one else is on this board yet. Invite people from the board members page.
      </div>
    );
  }
  return (
    <div className={styles.assigneePicker}>
      {members.map((m) => {
        const active = selected.has(m.userId);
        return (
          <button
            key={m.userId}
            type="button"
            className={`${styles.assigneePickerRow} ${active ? styles.assigneePickerRowActive : ""}`}
            onClick={() => onToggle(m)}
          >
            <span className={styles.assigneePip}>{initialsForAssignee(m)}</span>
            <span className={styles.assigneePickerName}>{nameForAssignee(m)}</span>
            <span className={styles.assigneePickerMark} aria-hidden>
              {active ? "✓" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ColorSwatch({
  color,
  active,
  onClick,
}: {
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  const c = colorForName(color);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.swatch} ${active ? styles.swatchActive : ""}`}
      style={{ background: c.hue }}
      aria-label={`Color: ${color}`}
      aria-pressed={active}
    />
  );
}

function LabelEditor({
  label,
  onCancel,
  onSave,
  onDelete,
}: {
  label: WorkspaceLabel;
  onCancel: () => void;
  onSave: (patch: Partial<WorkspaceLabel>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [title, setTitle] = useState(label.title);
  const [color, setColor] = useState(label.color);
  return (
    <div className={styles.editor}>
      <div className={styles.editorRow}>
        <input
          className={styles.editorInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={50}
          autoFocus
        />
      </div>
      <div className={styles.swatchRow}>
        {PALETTE.map((p) => (
          <ColorSwatch key={p.name} color={p.name} active={color === p.name} onClick={() => setColor(p.name)} />
        ))}
      </div>
      <div className={styles.editorActions}>
        <button type="button" className={styles.editorDelete} onClick={onDelete}>
          Delete
        </button>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" className={styles.editorCancel} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.editorSave}
            disabled={!title.trim()}
            onClick={() => onSave({ title: title.trim(), color })}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function LabelCreator({
  title,
  color,
  onTitleChange,
  onColorChange,
  onCancel,
  onSave,
}: {
  title: string;
  color: string;
  onTitleChange: (s: string) => void;
  onColorChange: (s: string) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div className={styles.editor}>
      <div className={styles.editorRow}>
        <input
          className={styles.editorInput}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Label name"
          maxLength={50}
          autoFocus
        />
      </div>
      <div className={styles.swatchRow}>
        {PALETTE.map((p) => (
          <ColorSwatch key={p.name} color={p.name} active={color === p.name} onClick={() => onColorChange(p.name)} />
        ))}
      </div>
      <div className={styles.editorActions}>
        <div />
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" className={styles.editorCancel} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.editorSave}
            disabled={!title.trim()}
            onClick={onSave}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
