"use client";

import {
  CSSProperties,
  DragEvent,
  FormEvent,
  useCallback,
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
  card: { id: number; title: string | null };
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
  const fileInput = useRef<HTMLInputElement>(null);

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

  const reportCounts = useCallback(
    (next: CardDetail) => {
      onCountsChange?.(cardId, {
        itemsTotal: next.items.length,
        itemsDone: next.items.reduce((a, i) => a + (i.done ? 1 : 0), 0),
        attachments: next.attachments.length,
      });
    },
    [cardId, onCountsChange],
  );

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
    reportCounts(next);

    try {
      const res = await fetch(`/api/cards/${cardId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        const rolled = { ...data, items: data.items };
        setData(rolled);
        reportCounts(rolled);
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
      const rolled = { ...data, items: data.items };
      setData(rolled);
      reportCounts(rolled);
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
    const next = { ...data, items: updatedItems };
    setData(next);
    reportCounts(next);
    if (id < 0) return;
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !current }),
      });
      if (!res.ok) {
        const rolled = {
          ...data,
          items: data.items.map((i) => (i.id === id ? { ...i, done: current } : i)),
        };
        setData(rolled);
        reportCounts(rolled);
        setError("Could not update item");
      }
    } catch {
      setError("Network error.");
    }
  };

  const onDeleteItem = async (id: number) => {
    if (!data) return;
    const snapshot = data.items;
    const next = { ...data, items: snapshot.filter((i) => i.id !== id) };
    setData(next);
    reportCounts(next);
    if (id < 0) return;
    try {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const rolled = { ...data, items: snapshot };
        setData(rolled);
        reportCounts(rolled);
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
      setData((prev) => {
        if (!prev) return prev;
        const merged = { ...prev, attachments: [...prev.attachments, json.attachment as Attachment] };
        reportCounts(merged);
        return merged;
      });
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
    const snapshot = data.attachments;
    const next = { ...data, attachments: snapshot.filter((a) => a.id !== id) };
    setData(next);
    reportCounts(next);
    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const rolled = { ...data, attachments: snapshot };
        setData(rolled);
        reportCounts(rolled);
        setError("Could not delete image");
      }
    } catch {
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
