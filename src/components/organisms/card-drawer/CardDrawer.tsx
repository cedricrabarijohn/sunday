"use client";

import {
  CSSProperties,
  DragEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { PALETTE, colorForId, colorForName } from "@/lib/palette";
import styles from "./CardDrawer.module.scss";

type Item = { id: number; title: string | null; done: number; position: number | null };
type Attachment = {
  id: number;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string | null;
};
export type WorkspaceLabel = {
  id: number;
  title: string;
  color: string;
  position: number | null;
  isDefault: number;
};
type CardLabel = { id: number; title: string; color: string; position?: number | null };

type CardDetail = {
  card: { id: number; title: string | null; description?: string | null };
  items: Item[];
  attachments: Attachment[];
  labels: CardLabel[];
};

export type CardCounts = {
  itemsTotal: number;
  itemsDone: number;
  attachments: number;
};

type Props = {
  cardId: number;
  workspaceId: number;
  workspaceLabels: WorkspaceLabel[];
  onWorkspaceLabelsChange: (next: WorkspaceLabel[]) => void;
  onClose: () => void;
  onCountsChange?: (cardId: number, counts: CardCounts) => void;
  onTitleChange?: (cardId: number, title: string) => void;
  onLabelsChange?: (cardId: number, labels: CardLabel[]) => void;
  onDelete?: (cardId: number) => void;
};

function formatBytes(n: number | null) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function CardDrawer({
  cardId,
  workspaceId,
  workspaceLabels,
  onWorkspaceLabelsChange,
  onClose,
  onCountsChange,
  onTitleChange,
  onLabelsChange,
  onDelete,
}: Props) {
  const [data, setData] = useState<CardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Render via portal so the drawer escapes any ancestor that has a
  // transform/filter/will-change and would otherwise trap position: fixed.
  useEffect(() => {
    setMounted(true);
  }, []);

  const renameTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descRef = useRef<HTMLDivElement | null>(null);
  const [descEditing, setDescEditing] = useState(false);
  const [descSaving, setDescSaving] = useState(false);
  const [descDragActive, setDescDragActive] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // When a new card opens, exit any in-progress edit so the next open
  // starts from a clean read-only view.
  useEffect(() => {
    setDescEditing(false);
    setDescDragActive(false);
  }, [cardId]);

  // Whenever we enter edit mode, seed the editor with the persisted
  // description as real DOM. The editor is uncontrolled from then on;
  // React does not touch it again until the next entry into edit mode.
  useEffect(() => {
    if (!descEditing || !descRef.current || !data) return;
    descRef.current.innerHTML = descriptionToHtml(data.card.description ?? "");
    descRef.current.focus();
    // Place caret at end so the user can immediately keep typing.
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(descRef.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [descEditing, data]);

  // Fetch detail on mount
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetch(`/api/cards/${cardId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load card");
        const json = (await res.json()) as CardDetail;
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load card. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  // Esc closes the drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pickerOpen) setPickerOpen(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pickerOpen]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Counts are reported to the parent in an effect rather than inline so we
  // never call the parent's setState during this component's render or
  // commit (which would trigger React's "setState during render" warning).
  // We pin the latest callback in a ref so the effect doesn't re-run when
  // the parent passes a fresh function each render, which would loop.
  const onCountsChangeRef = useRef(onCountsChange);
  useEffect(() => {
    onCountsChangeRef.current = onCountsChange;
  }, [onCountsChange]);

  useEffect(() => {
    if (!data) return;
    onCountsChangeRef.current?.(cardId, {
      itemsTotal: data.items.length,
      itemsDone: data.items.reduce((a, i) => a + (i.done ? 1 : 0), 0),
      attachments: data.attachments.length,
    });
  }, [data, cardId]);

  // --- Card title rename ---
  const onCardTitleChange = (title: string) => {
    if (!data) return;
    setData({ ...data, card: { ...data.card, title } });
    onTitleChange?.(cardId, title);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    // Empty titles aren't saved (no error shown either).
    if (!title.trim()) return;
    titleTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks/${cardId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) setError("Could not save title");
      } catch {
        setError("Network error. Title not saved.");
      }
    }, 400);
  };

  // --- Description ---
  // The description is stored as a small markdown subset. The editor is
  // a contentEditable div that's only shown in edit mode. Saving is
  // explicit (Save button); Cancel discards the in-editor changes.

  const enterEdit = () => setDescEditing(true);

  const cancelEdit = () => {
    setDescEditing(false);
    setDescDragActive(false);
  };

  const saveEdit = async () => {
    if (!descRef.current || !data) return;
    const next = serializeDescription(descRef.current);
    setDescSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Could not save description");
        return;
      }
      setData((prev) => (prev ? { ...prev, card: { ...prev.card, description: next } } : prev));
      setDescEditing(false);
    } catch {
      setError("Network error. Description not saved.");
    } finally {
      setDescSaving(false);
    }
  };

  const applyCommand = (command: string, value?: string) => {
    descRef.current?.focus();
    document.execCommand(command, false, value);
  };

  // Upload a single image and push the new attachment to local state so
  // the Images section reflects it. Returns the public URL on success.
  const uploadImageForDescription = async (file: File): Promise<{ url: string; alt: string } | null> => {
    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed");
      return null;
    }
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/cards/${cardId}/attachments`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Upload failed");
        return null;
      }
      setData((prev) =>
        prev
          ? { ...prev, attachments: [...prev.attachments, json.attachment as Attachment] }
          : prev,
      );
      const alt = (json.attachment.filename || "image").replace(/[\]\[]/g, "");
      return { url: json.attachment.url as string, alt };
    } catch {
      setError("Network error. Upload failed.");
      return null;
    }
  };

  const focusEditorAtRange = (range: Range | null) => {
    if (!descRef.current) return;
    descRef.current.focus();
    if (range) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };

  const insertImageAtCursor = (url: string, alt: string) => {
    const editor = descRef.current;
    if (!editor) return;
    const img = document.createElement("img");
    img.src = url;
    img.alt = alt;
    img.draggable = false;
    img.className = styles.descInlineImage;

    let range: Range | null = null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    }
    if (range) {
      range.deleteContents();
      range.insertNode(img);
      // Give the image its own paragraph so it always sits on its own line.
      const after = document.createElement("br");
      img.after(after);
      range.setStartAfter(after);
      range.setEndAfter(after);
      sel!.removeAllRanges();
      sel!.addRange(range);
    } else {
      editor.appendChild(img);
      editor.appendChild(document.createElement("br"));
    }
  };

  const onDescPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItems = items.filter((it) => it.kind === "file" && it.type.startsWith("image/"));

    if (imageItems.length > 0) {
      e.preventDefault();
      for (const it of imageItems) {
        const file = it.getAsFile();
        if (!file) continue;
        const up = await uploadImageForDescription(file);
        if (up) insertImageAtCursor(up.url, up.alt);
      }
      return;
    }

    // Force plain-text paste so fancy formatting from other apps does not
    // bleed into the editor. We keep newlines.
    const text = e.clipboardData.getData("text/plain");
    if (text) {
      e.preventDefault();
      document.execCommand("insertText", false, text);
    }
  };

  const onDescDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
    e.preventDefault();
    setDescDragActive(true);
  };

  const onDescDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!descDragActive) setDescDragActive(true);
  };

  const onDescDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    setDescDragActive(false);
  };

  const onDescDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDescDragActive(false);
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;

    // Place the cursor at the drop position so the image lands where
    // the user dropped it, not at the end of the document.
    let dropRange: Range | null = null;
    type CaretFromPoint = (x: number, y: number) => Range | null;
    type CaretPosition = { offsetNode: Node; offset: number };
    type CaretPositionFromPoint = (x: number, y: number) => CaretPosition | null;
    type DocWithCaret = Document & {
      caretRangeFromPoint?: CaretFromPoint;
      caretPositionFromPoint?: CaretPositionFromPoint;
    };
    const doc = document as DocWithCaret;
    if (typeof doc.caretRangeFromPoint === "function") {
      dropRange = doc.caretRangeFromPoint(e.clientX, e.clientY);
    } else if (typeof doc.caretPositionFromPoint === "function") {
      const pos = doc.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) {
        dropRange = document.createRange();
        dropRange.setStart(pos.offsetNode, pos.offset);
        dropRange.collapse(true);
      }
    }
    // If the caret landed outside the editor (e.g. on the toolbar / footer
    // / overlay) fall back to inserting at the end of the editor.
    if (dropRange && descRef.current && !descRef.current.contains(dropRange.startContainer)) {
      dropRange = null;
    }
    if (!dropRange && descRef.current) {
      dropRange = document.createRange();
      dropRange.selectNodeContents(descRef.current);
      dropRange.collapse(false);
    }
    focusEditorAtRange(dropRange);

    for (const file of files) {
      const up = await uploadImageForDescription(file);
      if (up) insertImageAtCursor(up.url, up.alt);
    }
  };

  // --- Items ---
  const onAddItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!data) return;
    const trimmed = newItem.trim();
    if (!trimmed) return;
    setAdding(true);
    setError(null);

    const tempId = -Date.now();
    const optimistic: Item = {
      id: tempId,
      title: trimmed,
      done: 0,
      position: (data.items.at(-1)?.position ?? 0) + 1,
    };
    const next = { ...data, items: [...data.items, optimistic] };
    setData(next);
    setNewItem("");

    try {
      const res = await fetch(`/api/cards/${cardId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setData({ ...data, items: data.items });
        setError(json.error || "Could not add item");
        return;
      }
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((i) => (i.id === tempId ? (json.item as Item) : i)),
        };
      });
    } catch {
      setData({ ...data, items: data.items });
      setError("Network error.");
    } finally {
      setAdding(false);
    }
  };

  const onRenameItem = (id: number, title: string) => {
    setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((i) => (i.id === id ? { ...i, title } : i)) }
        : prev,
    );
    if (id < 0) return;
    const existing = renameTimers.current.get(id);
    if (existing) clearTimeout(existing);
    // Empty titles aren't saved.
    if (!title.trim()) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) setError("Could not save change");
      } catch {
        setError("Network error.");
      }
    }, 400);
    renameTimers.current.set(id, timer);
  };

  const onToggleItem = async (id: number, current: number) => {
    if (!data) return;
    const updatedItems = data.items.map((i) => (i.id === id ? { ...i, done: current ? 0 : 1 } : i));
    setData({ ...data, items: updatedItems });
    if (id < 0) return;
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !current }),
      });
      if (!res.ok) {
        setData({
          ...data,
          items: data.items.map((i) => (i.id === id ? { ...i, done: current } : i)),
        });
        setError("Could not update item");
      }
    } catch {
      setError("Network error.");
    }
  };

  const onDeleteItem = async (id: number) => {
    if (!data) return;
    const snapshot = data.items;
    setData({ ...data, items: snapshot.filter((i) => i.id !== id) });
    if (id < 0) return;
    try {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setData({ ...data, items: snapshot });
        setError("Could not delete item");
      }
    } catch {
      setError("Network error.");
    }
  };

  // --- Attachments ---
  const uploadFile = async (file: File) => {
    if (!data) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/cards/${cardId}/attachments`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Upload failed");
        return;
      }
      setData((prev) =>
        prev
          ? { ...prev, attachments: [...prev.attachments, json.attachment as Attachment] }
          : prev,
      );
    } catch {
      setError("Network error. Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) await uploadFile(f);
  };

  const onDrop = async (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files?.length) {
      await onPickFiles(e.dataTransfer.files);
    }
  };

  const onDeleteAttachment = async (id: number) => {
    if (!data) return;
    const attachment = data.attachments.find((a) => a.id === id);
    const snapshotAttachments = data.attachments;
    const snapshotDescription = data.card.description ?? "";

    const scrubbedDescription = attachment?.url
      ? stripImageFromDescription(snapshotDescription, attachment.url)
      : snapshotDescription;
    const descriptionChanged = scrubbedDescription !== snapshotDescription;

    // Optimistic: drop the attachment row and scrub the description.
    setData({
      ...data,
      attachments: snapshotAttachments.filter((a) => a.id !== id),
      card: { ...data.card, description: scrubbedDescription },
    });

    // If the editor is open, also remove the matching <img> from the DOM
    // so the user doesn't see a broken reference while editing.
    if (descEditing && descRef.current && attachment?.url) {
      const imgs = descRef.current.querySelectorAll("img");
      for (const img of Array.from(imgs)) {
        if ((img as HTMLImageElement).src === attachment.url) img.remove();
      }
    }

    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setData({
          ...data,
          attachments: snapshotAttachments,
          card: { ...data.card, description: snapshotDescription },
        });
        setError("Could not delete image");
        return;
      }
      // Also persist the cleaned description so a refresh stays clean.
      if (descriptionChanged) {
        try {
          await fetch(`/api/tasks/${cardId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: scrubbedDescription }),
          });
        } catch {
          // Non-fatal: the attachment is gone, the description will catch
          // up next time the user saves the description.
        }
      }
    } catch {
      setData({
        ...data,
        attachments: snapshotAttachments,
        card: { ...data.card, description: snapshotDescription },
      });
      setError("Network error.");
    }
  };

  // --- Labels ---
  const persistCardLabels = async (cardLabels: CardLabel[]) => {
    try {
      const res = await fetch(`/api/cards/${cardId}/labels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelIds: cardLabels.map((l) => l.id) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Could not update labels");
      }
    } catch {
      setError("Network error.");
    }
  };

  const onToggleLabel = (label: WorkspaceLabel) => {
    if (!data) return;
    const has = data.labels.some((l) => l.id === label.id);
    const nextLabels = has
      ? data.labels.filter((l) => l.id !== label.id)
      : [...data.labels, { id: label.id, title: label.title, color: label.color }];
    const next = { ...data, labels: nextLabels };
    setData(next);
    onLabelsChange?.(cardId, nextLabels);
    persistCardLabels(nextLabels);
  };

  const onCreateLabel = async (title: string, color: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, color }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not create label");
        return;
      }
      const next: WorkspaceLabel = { ...json.label };
      onWorkspaceLabelsChange([...workspaceLabels, next]);
    } catch {
      setError("Network error.");
    }
  };

  const onEditLabel = async (label: WorkspaceLabel, patch: Partial<WorkspaceLabel>) => {
    const optimistic = workspaceLabels.map((l) => (l.id === label.id ? { ...l, ...patch } : l));
    onWorkspaceLabelsChange(optimistic);
    if (data) {
      const inCard = data.labels.some((l) => l.id === label.id);
      if (inCard) {
        const nextCardLabels = data.labels.map((l) =>
          l.id === label.id
            ? { ...l, title: patch.title ?? l.title, color: patch.color ?? l.color }
            : l,
        );
        setData({ ...data, labels: nextCardLabels });
        onLabelsChange?.(cardId, nextCardLabels);
      }
    }
    try {
      const res = await fetch(`/api/labels/${label.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        onWorkspaceLabelsChange(workspaceLabels);
        setError(json.error || "Could not update label");
      }
    } catch {
      onWorkspaceLabelsChange(workspaceLabels);
      setError("Network error.");
    }
  };

  const onDeleteLabel = async (label: WorkspaceLabel) => {
    if (!confirm(`Delete label "${label.title}"? It will be removed from all cards in this workspace.`))
      return;
    const snapshot = workspaceLabels;
    onWorkspaceLabelsChange(workspaceLabels.filter((l) => l.id !== label.id));
    if (data) {
      const nextLabels = data.labels.filter((l) => l.id !== label.id);
      if (nextLabels.length !== data.labels.length) {
        setData({ ...data, labels: nextLabels });
        onLabelsChange?.(cardId, nextLabels);
      }
    }
    try {
      const res = await fetch(`/api/labels/${label.id}`, { method: "DELETE" });
      if (!res.ok) {
        onWorkspaceLabelsChange(snapshot);
        setError("Could not delete label");
      }
    } catch {
      onWorkspaceLabelsChange(snapshot);
      setError("Network error.");
    }
  };

  // --- Delete the whole card ---
  const onDeleteCard = async () => {
    if (!data) return;
    if (!confirm("Delete this card and all its sub-tasks and images?")) return;
    try {
      const res = await fetch(`/api/tasks/${cardId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not delete card");
        return;
      }
      onDelete?.(cardId);
      onClose();
    } catch {
      setError("Network error.");
    }
  };

  const color = colorForId(cardId);
  const drawerStyle = {
    "--card-hue": color.hue,
    "--card-soft": color.soft,
  } as CSSProperties;

  const stats = data
    ? {
        total: data.items.length,
        done: data.items.reduce((a, i) => a + (i.done ? 1 : 0), 0),
      }
    : { total: 0, done: 0 };
  const pct = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);

  if (!mounted) return null;

  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <aside className={styles.drawer} style={drawerStyle} role="dialog" aria-modal="true">
        <header className={styles.head}>
          <span className={styles.headBadge}>
            {(data?.card.title?.[0] || "C").toUpperCase()}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className={styles.headMeta}>Card · #{cardId.toString().padStart(3, "0")}</span>
            {data ? (
              <input
                className={styles.headTitle}
                defaultValue={data.card.title || ""}
                onChange={(e) => onCardTitleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                placeholder="Untitled"
              />
            ) : (
              <div className={styles.loadBlock} style={{ width: "70%" }} />
            )}
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {!data ? (
          <div className={styles.loading}>
            <div className={styles.loadBlock} style={{ width: "30%" }} />
            <div className={styles.loadBlock} style={{ height: 60 }} />
            <div className={styles.loadBlock} style={{ width: "30%", marginTop: "1rem" }} />
            <div className={styles.loadBlock} style={{ height: 120 }} />
          </div>
        ) : (
          <div className={styles.body}>
            {error && <div className={styles.error}>{error}</div>}

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionLabel}>Labels</span>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-expanded={pickerOpen}
                >
                  {pickerOpen ? "Close" : "Edit labels"}
                </button>
              </div>
              <div className={styles.cardLabels}>
                {data.labels.length === 0 ? (
                  <span className={styles.cardLabelsEmpty}>No labels yet. Add one to categorize this card.</span>
                ) : (
                  data.labels.map((l) => {
                    const c = colorForName(l.color);
                    return (
                      <span
                        key={l.id}
                        className={styles.labelChip}
                        style={{ background: c.soft, color: c.hue }}
                      >
                        <span
                          className={styles.labelDot}
                          style={{ background: c.hue }}
                          aria-hidden
                        />
                        {l.title}
                      </span>
                    );
                  })
                )}
              </div>
              {pickerOpen && (
                <LabelsPicker
                  workspaceLabels={workspaceLabels}
                  selected={new Set(data.labels.map((l) => l.id))}
                  onToggle={onToggleLabel}
                  onCreate={onCreateLabel}
                  onEdit={onEditLabel}
                  onDelete={onDeleteLabel}
                />
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionLabel}>Description</span>
                {!descEditing && (
                  <button type="button" className={styles.linkBtn} onClick={enterEdit}>
                    {data.card.description ? "Edit" : "Add"}
                  </button>
                )}
              </div>

              {descEditing ? (
                <div
                  className={`${styles.descShell} ${descDragActive ? styles.descShellDrop : ""}`}
                  onDragEnter={onDescDragEnter}
                  onDragOver={onDescDragOver}
                  onDragLeave={onDescDragLeave}
                  onDrop={onDescDrop}
                >
                  <DescToolbar onCmd={applyCommand} />
                  <div
                    ref={descRef}
                    className={styles.descEditor}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck
                    onPaste={onDescPaste}
                    data-placeholder="Write a description. Use the toolbar to format. Paste or drop an image anywhere here to embed it."
                  />
                  <div className={styles.descFooter}>
                    <span className={styles.descFooterHint}>
                      Paste or drop an image to embed it inline
                    </span>
                    <div className={styles.descFooterActions}>
                      <button
                        type="button"
                        className={styles.descBtnGhost}
                        onClick={cancelEdit}
                        disabled={descSaving}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.descBtnPrimary}
                        onClick={saveEdit}
                        disabled={descSaving}
                      >
                        {descSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                  <div
                    className={`${styles.descDropOverlay} ${descDragActive ? styles.descDropOverlayActive : ""}`}
                    aria-hidden
                  >
                    <span className={styles.descDropMark}>↧</span>
                    Drop image to embed
                  </div>
                </div>
              ) : (
                <DescriptionView text={data.card.description ?? ""} onEdit={enterEdit} />
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionLabel}>Sub-tasks</span>
                <span className={styles.sectionCount}>
                  {stats.done}/{stats.total} done
                </span>
              </div>
              <div className={styles.progress}>
                <div className={styles.progressFill} style={{ width: `${pct}%` }} />
              </div>

              {data.items.length > 0 && (
                <div className={styles.items}>
                  {data.items.map((it) => (
                    <div key={it.id} className={styles.item}>
                      <button
                        type="button"
                        className={`${styles.itemCheck} ${it.done ? styles.itemCheckDone : ""}`}
                        onClick={() => onToggleItem(it.id, it.done)}
                        aria-label="Toggle item"
                      />
                      <input
                        className={`${styles.itemTitle} ${it.done ? styles.itemTitleDone : ""}`}
                        defaultValue={it.title || ""}
                        onChange={(e) => onRenameItem(it.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                      <button
                        type="button"
                        className={styles.itemDel}
                        onClick={() => onDeleteItem(it.id)}
                        aria-label="Delete item"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form className={styles.composer} onSubmit={onAddItem}>
                <input
                  className={styles.composerInput}
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  placeholder="Add a sub-task and press enter"
                  maxLength={255}
                />
                <button
                  type="submit"
                  className={styles.composerBtn}
                  disabled={adding || !newItem.trim()}
                >
                  {adding ? "Adding" : "Add"}
                </button>
              </form>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionLabel}>Images</span>
                <span className={styles.sectionCount}>{data.attachments.length}</span>
              </div>

              {data.attachments.length > 0 && (
                <div className={styles.gallery}>
                  {data.attachments.map((a) => (
                    <a
                      key={a.id}
                      className={styles.thumb}
                      href={a.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      title={`${a.filename ?? "image"} · ${formatBytes(a.sizeBytes)}`}
                    >
                      {a.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.url} alt={a.filename ?? "attachment"} loading="lazy" />
                      ) : null}
                      <button
                        type="button"
                        className={styles.thumbDel}
                        onClick={(e) => {
                          e.preventDefault();
                          onDeleteAttachment(a.id);
                        }}
                        aria-label="Delete image"
                      >
                        Remove
                      </button>
                    </a>
                  ))}
                </div>
              )}

              <label
                className={`${styles.drop} ${dragActive ? styles.dropActive : ""}`}
                onDragEnter={() => setDragActive(true)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  className={styles.fileInput}
                  onChange={(e) => onPickFiles(e.target.files)}
                />
                <span className={styles.dropMark}>＋</span>
                <div>
                  {uploading
                    ? "Uploading…"
                    : dragActive
                    ? "Drop to upload"
                    : "Click or drop images here"}
                </div>
                <span className={styles.dropHint}>PNG, JPG, GIF, WebP up to 5 MB</span>
              </label>
            </section>
          </div>
        )}

        <footer className={styles.foot}>
          <span className={styles.footMeta}>
            {data ? `${data.labels.length} labels · ${stats.total} sub-tasks · ${data.attachments.length} images` : ""}
          </span>
          <button type="button" className={styles.deleteCard} onClick={onDeleteCard}>
            Delete card
          </button>
        </footer>
      </aside>
    </>,
    document.body,
  );
}

/* ------------------------------------------------------- *
 *   Labels picker: list, toggle, edit, create, delete     *
 * ------------------------------------------------------- */

function LabelsPicker({
  workspaceLabels,
  selected,
  onToggle,
  onCreate,
  onEdit,
  onDelete,
}: {
  workspaceLabels: WorkspaceLabel[];
  selected: Set<number>;
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
              <button
                type="button"
                className={styles.pickerEdit}
                onClick={() => setEditingId(l.id)}
                aria-label="Edit label"
              >
                Edit
              </button>
            </div>
          ),
        )}
      </div>

      {creating ? (
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

/* ------------------------------------------------------- *
 *   Description <-> markdown converters.
 *
 *   Stored as a small markdown subset:
 *     - paragraphs separated by blank lines
 *     - **bold**, *italic*, __underline__, ~~strike~~, `code`
 *     - "- " unordered list line, "1. " ordered list line
 *     - "![alt](url)" image
 *
 *   The WYSIWYG editor renders these as real DOM nodes. On Save we
 *   serialize the DOM back to markdown so the stored form stays
 *   portable and we never have to trust raw HTML.
 * ------------------------------------------------------- */

const IMAGE_LINE = /^!\[([^\]]*)\]\((\S+)\)\s*$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Allow only http(s) and root-relative URLs in <img src>. */
function safeUrl(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  if (t.startsWith("/")) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return null;
}

function inlineMd(text: string): string {
  let t = escapeHtml(text);

  // Extract `code` spans into placeholders so bold/italic/etc. don't
  // eat markers that happen to live inside code.
  const codes: string[] = [];
  t = t.replace(/`([^`]+)`/g, (_m, c: string) => {
    const i = codes.push(`<code>${c}</code>`) - 1;
    return ` ${i} `;
  });

  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/__([^_]+)__/g, "<u>$1</u>");
  t = t.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    const safe = safeUrl(url);
    if (!safe) return "";
    return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}" draggable="false" />`;
  });

  // Restore protected code spans.
  t = t.replace(/ (\d+) /g, (_m, idx: string) => codes[Number(idx)] ?? "");

  return t;
}

function descriptionToHtml(text: string): string {
  if (!text.trim()) return "";
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n");

      const imgMatches = lines.map((l) => l.match(IMAGE_LINE));
      if (imgMatches.every((m) => m !== null)) {
        return (
          "<p>" +
          imgMatches
            .map((m) => {
              if (!m) return "";
              const safe = safeUrl(m[2]);
              if (!safe) return "";
              return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(m[1])}" draggable="false" />`;
            })
            .join("") +
          "</p>"
        );
      }

      if (lines.every((l) => /^- /.test(l))) {
        return (
          "<ul>" +
          lines.map((l) => `<li>${inlineMd(l.replace(/^- /, ""))}</li>`).join("") +
          "</ul>"
        );
      }

      if (lines.every((l) => /^\d+\. /.test(l))) {
        return (
          "<ol>" +
          lines.map((l) => `<li>${inlineMd(l.replace(/^\d+\.\s+/, ""))}</li>`).join("") +
          "</ol>"
        );
      }

      return "<p>" + lines.map(inlineMd).join("<br>") + "</p>";
    })
    .join("");
}

function inlineToMarkdown(el: Node): string {
  let out = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? "";
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const c = child as HTMLElement;
    const tag = c.tagName;
    if (tag === "BR") {
      out += "\n";
    } else if (tag === "STRONG" || tag === "B") {
      out += `**${inlineToMarkdown(c)}**`;
    } else if (tag === "EM" || tag === "I") {
      out += `*${inlineToMarkdown(c)}*`;
    } else if (tag === "U") {
      out += `__${inlineToMarkdown(c)}__`;
    } else if (tag === "S" || tag === "STRIKE" || tag === "DEL") {
      out += `~~${inlineToMarkdown(c)}~~`;
    } else if (tag === "CODE") {
      out += `\`${inlineToMarkdown(c)}\``;
    } else if (tag === "IMG") {
      const img = c as HTMLImageElement;
      const alt = (img.alt ?? "").replace(/[\]\[]/g, "");
      out += `\n![${alt}](${img.src})\n`;
    } else {
      out += inlineToMarkdown(c);
    }
  }
  return out;
}

const INLINE_TAGS = new Set([
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "STRIKE",
  "DEL",
  "CODE",
  "A",
  "SPAN",
  "FONT",
  "SUB",
  "SUP",
  "MARK",
  "SMALL",
]);

function serializeDescription(editor: HTMLElement): string {
  const blocks: string[] = [];

  const pushParagraph = (markdown: string) => {
    const lines = markdown.split("\n");
    let buf: string[] = [];
    const flush = () => {
      if (buf.length === 0) return;
      const text = buf.join("\n").trim();
      if (text) blocks.push(text);
      buf = [];
    };
    for (const line of lines) {
      if (IMAGE_LINE.test(line.trim())) {
        flush();
        blocks.push(line.trim());
      } else {
        buf.push(line);
      }
    }
    flush();
  };

  const visit = (parent: Node) => {
    let inlineBuf: string[] = [];
    const flushInline = () => {
      const md = inlineBuf.join("").trim();
      if (md) pushParagraph(md);
      inlineBuf = [];
    };

    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        inlineBuf.push(node.textContent ?? "");
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as HTMLElement;
      const tag = el.tagName;

      if (tag === "BR") {
        inlineBuf.push("\n");
        continue;
      }
      if (INLINE_TAGS.has(tag)) {
        inlineBuf.push(inlineToMarkdown(el));
        continue;
      }
      if (tag === "IMG") {
        // Top-level image: its own block.
        flushInline();
        const img = el as HTMLImageElement;
        const alt = (img.alt ?? "").replace(/[\]\[]/g, "");
        blocks.push(`![${alt}](${img.src})`);
        continue;
      }

      // Block elements from here on: flush any pending inline content.
      flushInline();

      if (tag === "UL") {
        const items = Array.from(el.children).filter((c) => c.tagName === "LI") as HTMLElement[];
        if (items.length) {
          // Whole list = one block so the renderer sees consecutive
          // "- " lines and groups them back into a single <ul>.
          blocks.push(items.map((li) => `- ${inlineToMarkdown(li).trim()}`).join("\n"));
        }
        continue;
      }
      if (tag === "OL") {
        const items = Array.from(el.children).filter((c) => c.tagName === "LI") as HTMLElement[];
        if (items.length) {
          blocks.push(items.map((li, i) => `${i + 1}. ${inlineToMarkdown(li).trim()}`).join("\n"));
        }
        continue;
      }
      if (
        tag === "P" ||
        tag === "DIV" ||
        tag === "BLOCKQUOTE" ||
        tag === "SECTION" ||
        tag === "ARTICLE" ||
        tag === "HEADER" ||
        tag === "FOOTER"
      ) {
        // Recurse so nested lists, images, etc. are picked up correctly.
        visit(el);
        continue;
      }

      // Unknown block: just keep its inline content as a paragraph.
      pushParagraph(inlineToMarkdown(el));
    }

    flushInline();
  };

  visit(editor);
  return blocks.join("\n\n").trim();
}

/** Strip every occurrence of an image URL from a description. */
function stripImageFromDescription(text: string, url: string): string {
  if (!text || !url) return text ?? "";
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const inlinePattern = new RegExp(`!\\[[^\\]]*\\]\\(${escaped}\\)`, "g");
  const lines = text.split("\n").map((l) => l.replace(inlinePattern, ""));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ------------------------------------------------------- *
 *   Read-only renderer for the description.
 *   Re-uses the markdown -> HTML pass; the HTML is safe because we
 *   produced it ourselves from a known-controlled markdown shape.
 * ------------------------------------------------------- */

function DescriptionView({ text, onEdit }: { text: string; onEdit: () => void }) {
  if (!text.trim()) {
    return (
      <button type="button" className={styles.descEmpty} onClick={onEdit}>
        No description yet. Click to add one.
      </button>
    );
  }
  return (
    <div
      className={styles.descView}
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit();
        }
      }}
      dangerouslySetInnerHTML={{ __html: descriptionToHtml(text) }}
    />
  );
}

/* ------------------------------------------------------- *
 *   Description toolbar: minimal formatting commands.
 *   The buttons use mousedown + preventDefault so the focus stays on
 *   the editor and the current selection is preserved.
 * ------------------------------------------------------- */

const TOOLBAR_BUTTONS: ReadonlyArray<{
  cmd: string;
  label: string;
  title: string;
  weight?: number;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  mono?: boolean;
}> = [
  { cmd: "bold", label: "B", title: "Bold (Ctrl/Cmd+B)", weight: 700 },
  { cmd: "italic", label: "I", title: "Italic (Ctrl/Cmd+I)", italic: true },
  { cmd: "underline", label: "U", title: "Underline (Ctrl/Cmd+U)", underline: true },
  { cmd: "strikeThrough", label: "S", title: "Strikethrough", strike: true },
  { cmd: "insertUnorderedList", label: "•", title: "Bullet list" },
  { cmd: "insertOrderedList", label: "1.", title: "Numbered list" },
];

function DescToolbar({ onCmd }: { onCmd: (cmd: string, value?: string) => void }) {
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
        <button
          key={b.cmd}
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
            onCmd(b.cmd);
          }}
        >
          {b.label}
        </button>
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
    </div>
  );
}
