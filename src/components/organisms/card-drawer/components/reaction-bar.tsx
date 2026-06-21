"use client";

import { useRef, useState } from "react";
import styles from "../styles/CardDrawer.module.scss";
import type { Reaction } from "../lib/types";
import EmojiPicker from "@/components/organisms/emoji-picker/EmojiPicker";

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
