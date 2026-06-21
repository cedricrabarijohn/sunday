"use client";

import { Fragment, useRef, useState } from "react";
import { ImageIcon } from "@/components/Icons";
import EmojiPicker from "@/components/organisms/emoji-picker/EmojiPicker";
import styles from "@/components/organisms/card-drawer/styles/CardDrawer.module.scss";

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
