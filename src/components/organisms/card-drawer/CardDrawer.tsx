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
import { colorForId } from "@/lib/palette";
import styles from "./CardDrawer.module.scss";

type Item = { id: number; title: string | null; done: number; position: number | null };
type Attachment = {
  id: number;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string | null;
};

type CardDetail = {
  card: { id: number; title: string | null; done: number };
  items: Item[];
  attachments: Attachment[];
};

export type CardCounts = {
  itemsTotal: number;
  itemsDone: number;
  attachments: number;
};

type Props = {
  cardId: number;
  onClose: () => void;
  onCountsChange?: (cardId: number, counts: CardCounts) => void;
  onTitleChange?: (cardId: number, title: string) => void;
  onDoneChange?: (cardId: number, done: number) => void;
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
  onClose,
  onCountsChange,
  onTitleChange,
  onDoneChange,
  onDelete,
}: Props) {
  const [data, setData] = useState<CardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  // --- Card title rename (debounced) ---
  const onCardTitleChange = (title: string) => {
    if (!data) return;
    setData({ ...data, card: { ...data.card, title } });
    onTitleChange?.(cardId, title);
    if (titleTimer.current) clearTimeout(titleTimer.current);
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

  const onCardDoneToggle = async () => {
    if (!data) return;
    const next = data.card.done ? 0 : 1;
    setData({ ...data, card: { ...data.card, done: next } });
    onDoneChange?.(cardId, next);
    try {
      const res = await fetch(`/api/tasks/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !data.card.done }),
      });
      if (!res.ok) {
        setError("Could not update card");
        setData({ ...data, card: { ...data.card, done: data.card.done } });
        onDoneChange?.(cardId, data.card.done);
      }
    } catch {
      setError("Network error.");
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
        const merged = {
          ...prev,
          items: prev.items.map((i) => (i.id === tempId ? (json.item as Item) : i)),
        };
        return merged;
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
      prev ? { ...prev, items: prev.items.map((i) => (i.id === id ? { ...i, title } : i)) } : prev,
    );
    if (id < 0) return;
    const existing = renameTimers.current.get(id);
    if (existing) clearTimeout(existing);
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

  return (
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
                className={`${styles.headTitle} ${data.card.done ? styles.headTitleDone : ""}`}
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
          {data && (
            <button
              type="button"
              className={`${styles.itemCheck} ${data.card.done ? styles.itemCheckDone : ""}`}
              style={{ width: 22, height: 22, borderRadius: 5 }}
              onClick={onCardDoneToggle}
              aria-label="Toggle card done"
            />
          )}
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
            {data ? `${data.attachments.length} images · ${stats.total} sub-tasks` : ""}
          </span>
          <button type="button" className={styles.deleteCard} onClick={onDeleteCard}>
            Delete card
          </button>
        </footer>
      </aside>
    </>
  );
}
