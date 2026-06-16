"use client";

import { useEffect, useRef } from "react";
import styles from "./EmojiPicker.module.scss";

const EMOJIS = [
  "😀","😂","🥹","😊","😍","🤩","🥰","😎","🤔","😅",
  "🙄","😭","😡","🤗","😴","😇","🥲","😋","😜","🫣",
  "👍","👎","👏","🙌","🤝","🙏","💪","🫶","✌️","🤞",
  "👌","🤌","👋","🫡","🤙","☝️","🫵","🤘","💅","🫰",
  "❤️","🔥","✅","❌","⚠️","💯","⭐","🌟","💡","🐛",
  "🎉","🎊","🚀","🏆","💰","📌","📣","🔑","🎯","💔",
];

export default function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className={styles.picker}>
      <div className={styles.grid}>
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={styles.emojiBtn}
            aria-label={emoji}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(emoji);
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
