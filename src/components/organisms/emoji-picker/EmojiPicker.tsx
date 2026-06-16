"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./EmojiPicker.module.scss";

const EMOJIS = [
  "😀","😂","🥹","😊","😍","🤩","🥰","😎","🤔","😅",
  "🙄","😭","😡","🤗","😴","😇","🥲","😋","😜","🫣",
  "👍","👎","👏","🙌","🤝","🙏","💪","🫶","✌️","🤞",
  "👌","🤌","👋","🫡","🤙","☝️","🫵","🤘","💅","🫰",
  "❤️","🔥","✅","❌","⚠️","💯","⭐","🌟","💡","🐛",
  "🎉","🎊","🚀","🏆","💰","📌","📣","🔑","🎯","💔",
];

const PICKER_W = 248;
const PICKER_H = 196;
const GAP = 6;

export default function EmojiPicker({
  anchor,
  onSelect,
  onClose,
}: {
  /** The trigger element the picker is positioned against. */
  anchor: HTMLElement | null;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position against the anchor in viewport coordinates (fixed), flipping
  // above when there isn't room below. Rendered in a portal so no ancestor
  // overflow can clip it.
  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const below = r.bottom + GAP;
    const above = r.top - GAP - PICKER_H;
    const enoughBelow = below + PICKER_H <= window.innerHeight;
    const top = enoughBelow ? below : Math.max(GAP, above);
    let left = r.left;
    if (left + PICKER_W > window.innerWidth - GAP) {
      left = Math.max(GAP, window.innerWidth - GAP - PICKER_W);
    }
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
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
  }, [onClose, anchor]);

  if (pos == null) return null;

  return createPortal(
    <div
      ref={ref}
      className={styles.picker}
      style={{ top: pos.top, left: pos.left }}
    >
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
    </div>,
    document.body,
  );
}
