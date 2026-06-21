"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../styles/CardDrawer.module.scss";
import { descriptionToHtml } from "../lib/markdown-to-html";

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
