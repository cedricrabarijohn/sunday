"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon } from "@/components/Icons";
import EmojiPicker from "@/components/organisms/emoji-picker/EmojiPicker";
import styles from "./CardDrawer.module.scss";
import type { Reaction } from "./types";
import { descriptionToHtml } from "./description-markdown";

export function DescMenu({
  hasContent,
  onEdit,
  onClear,
}: {
  hasContent: boolean;
  onEdit: () => void;
  onClear: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.kebabWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.kebabBtn}
        aria-label="Description actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div className={styles.kebabMenu} role="menu">
          <button
            type="button"
            className={styles.kebabItem}
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            {hasContent ? "Edit description" : "Add description"}
          </button>
          {hasContent && (
            <button
              type="button"
              className={`${styles.kebabItem} ${styles.kebabItemDanger}`}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void onClear();
              }}
            >
              Clear description
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function DescriptionView({
  text,
  onEdit,
  canEdit = true,
}: {
  text: string;
  onEdit: () => void;
  canEdit?: boolean;
}) {
  if (!text.trim()) {
    if (!canEdit) {
      return <div className={styles.descEmpty}>No description.</div>;
    }
    // Empty state stays clickable so the user can jump straight into the
    // editor without going through the kebab menu.
    return (
      <button type="button" className={styles.descEmpty} onClick={onEdit}>
        No description yet. Click to add one.
      </button>
    );
  }
  // Content state is a plain, non-interactive div so the user can select and
  // copy text. Editing goes through the ⋯ menu, not a click.
  return <DescriptionContent text={text} />;
}

// Collapse height for a long description before "Show more" appears.
const DESC_COLLAPSED_MAX = 320;

function DescriptionContent({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const html = useMemo(() => descriptionToHtml(text), [text]);

  // Decide whether the content is tall enough to need a toggle. scrollHeight
  // is the full content height regardless of the collapse clamp, and the
  // ResizeObserver re-checks when late-loading images change the height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setOverflows(el.scrollHeight > DESC_COLLAPSED_MAX + 8);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [html]);

  const clamped = overflows && !expanded;

  return (
    <div>
      <div
        ref={ref}
        className={`${styles.descView} ${clamped ? styles.descViewClamped : ""}`}
        style={clamped ? { maxHeight: DESC_COLLAPSED_MAX } : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {overflows && (
        <button
          type="button"
          className={styles.descMore}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more…"}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------- *
 *   Description toolbar: minimal formatting commands.
 *   The buttons use mousedown + preventDefault so the focus stays on
 *   the editor and the current selection is preserved.
 * ------------------------------------------------------- */

const TOOLBAR_BUTTONS: ReadonlyArray<{
  cmd: string;
  value?: string;
  label: string;
  title: string;
  weight?: number;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  mono?: boolean;
  sepBefore?: boolean;
}> = [
  { cmd: "formatBlock", value: "H1", label: "H1", title: "Heading 1", weight: 700 },
  { cmd: "formatBlock", value: "H2", label: "H2", title: "Heading 2", weight: 700 },
  { cmd: "formatBlock", value: "H3", label: "H3", title: "Heading 3", weight: 700 },
  { cmd: "formatBlock", value: "P", label: "¶", title: "Normal text", sepBefore: true },
  { cmd: "bold", label: "B", title: "Bold (Ctrl/Cmd+B)", weight: 700, sepBefore: true },
  { cmd: "italic", label: "I", title: "Italic (Ctrl/Cmd+I)", italic: true },
  { cmd: "underline", label: "U", title: "Underline (Ctrl/Cmd+U)", underline: true },
  { cmd: "strikeThrough", label: "S", title: "Strikethrough", strike: true },
  { cmd: "insertUnorderedList", label: "•", title: "Bullet list", sepBefore: true },
  { cmd: "insertOrderedList", label: "1.", title: "Numbered list" },
];

export function ReactionBar({
  reactions,
  currentUserId,
  onToggle,
}: {
  reactions: Reaction[];
  currentUserId: number | undefined;
  onToggle: (emoji: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  if (reactions.length === 0 && !currentUserId) return null;
  return (
    <div className={styles.reactionBar}>
      {reactions.map((r) => {
        const active = currentUserId != null && r.userIds.includes(currentUserId);
        return (
          <button
            key={r.emoji}
            type="button"
            className={`${styles.reactionPill} ${active ? styles.reactionPillActive : ""}`}
            onClick={() => onToggle(r.emoji)}
            title={`${r.userIds.length} reaction${r.userIds.length !== 1 ? "s" : ""}`}
          >
            <span className={styles.reactionEmoji}>{r.emoji}</span>
            <span className={styles.reactionCount}>{r.userIds.length}</span>
          </button>
        );
      })}
      {currentUserId != null && (
        <div className={styles.reactionAddWrap}>
          <button
            ref={addBtnRef}
            type="button"
            className={styles.reactionAddBtn}
            onClick={() => setPickerOpen((v) => !v)}
            title="Add reaction"
            aria-label="Add reaction"
          >
            <SmileyPlusIcon />
          </button>
          {pickerOpen && (
            <EmojiPicker
              anchor={addBtnRef.current}
              onSelect={(emoji) => { onToggle(emoji); setPickerOpen(false); }}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** A smiley face with a small plus — the "add reaction" affordance. */
function SmileyPlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 4.5 1.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="9" cy="10" r="1.2" fill="currentColor" />
      <circle cx="15" cy="10" r="1.2" fill="currentColor" />
      <path
        d="M8.5 14.5a4 4 0 0 0 6 1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M19 3.5v4M17 5.5h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DescToolbar({
  onCmd,
  onPickImage,
  onInsertEmoji,
  onSave,
  onCancel,
  saving,
}: {
  onCmd: (cmd: string, value?: string) => void;
  onPickImage: (file: File) => void;
  onInsertEmoji: (emoji: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const wrapCode = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const text = range.toString();
    if (!text) return;
    const node = document.createElement("code");
    node.textContent = text;
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
      {TOOLBAR_BUTTONS.map((b) => (
        <Fragment key={`${b.cmd}-${b.value ?? b.label}`}>
          {b.sepBefore && <span className={styles.toolbarSep} aria-hidden />}
          <button
            type="button"
            className={styles.toolbarBtn}
            title={b.title}
            aria-label={b.title}
            style={{
              fontWeight: b.weight ?? 500,
              fontStyle: b.italic ? "italic" : undefined,
              textDecoration: b.underline
                ? "underline"
                : b.strike
                ? "line-through"
                : undefined,
              fontFamily: b.mono ? "var(--font-mono)" : undefined,
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              onCmd(b.cmd, b.value);
            }}
          >
            {b.label}
          </button>
        </Fragment>
      ))}
      <button
        type="button"
        className={styles.toolbarBtn}
        title="Inline code"
        aria-label="Inline code"
        style={{ fontFamily: "var(--font-mono)" }}
        onMouseDown={(e) => {
          e.preventDefault();
          wrapCode();
        }}
      >
        &lt;/&gt;
      </button>
      <span className={styles.toolbarSep} aria-hidden />
      <button
        type="button"
        className={styles.toolbarBtn}
        title="Insert image"
        aria-label="Insert image"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
      >
        <ImageIcon size={15} />
      </button>
      <div style={{ position: "relative", display: "inline-flex" }}>
        <button
          ref={emojiBtnRef}
          type="button"
          className={styles.toolbarBtn}
          title="Insert emoji"
          aria-label="Insert emoji"
          // Keep the editor's caret so the emoji lands where the user left off.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEmojiOpen((v) => !v)}
        >
          😊
        </button>
        {emojiOpen && (
          <EmojiPicker
            anchor={emojiBtnRef.current}
            onSelect={(emoji) => { onInsertEmoji(emoji); setEmojiOpen(false); }}
            onClose={() => setEmojiOpen(false)}
          />
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPickImage(file);
          e.target.value = "";
        }}
      />

      <div className={styles.toolbarActions}>
        <button
          type="button"
          className={styles.toolbarGhost}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.toolbarPrimary}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
