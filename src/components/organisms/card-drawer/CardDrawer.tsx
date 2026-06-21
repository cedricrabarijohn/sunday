"use client";

import {
  CSSProperties,
  DragEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { colorForId, colorForName } from "@/lib/palette";
import { useConfirm } from "@/components/organisms/confirm-dialog/ConfirmDialog";
import {
  UsersIcon,
  TagIcon,
  CalendarIcon,
  LinkIcon,
  TrashIcon,
} from "@/components/Icons";
import styles from "./CardDrawer.module.scss";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import { FieldCell } from "@/app/[locale]/boards/[id]/_components/TableFields";
import type { BoardColumn, FieldValue } from "@/app/[locale]/boards/[id]/_lib/board-types";
import EmojiPicker from "@/components/organisms/emoji-picker/EmojiPicker";
import { descriptionToHtml } from "./markdown-to-html";
import {
  serializeDescription,
  stripImageFromDescription,
} from "./dom-to-markdown";

import type {
  Item,
  Attachment,
  WorkspaceLabel,
  CardLabel,
  Assignee,
  Reaction,
  Comment,
  CardLink,
  CardDetail,
  CardCounts,
} from "./types";

// Re-exported for callers that import these from the drawer entrypoint.
export type { WorkspaceLabel, CardCounts } from "./types";
import {
  formatBytes,
  formatCommentTime,
  toLocalDatetimeValue,
  initialsForAssignee,
  nameForAssignee,
} from "./format";
import { LabelsPicker } from "./label-picker";
import { MetaPopover } from "./meta-popover";
import { CommentBody } from "./comment-body";
import { AssigneePicker } from "./assignee-picker";
import { DescMenu } from "./desc-menu";
import { DescriptionView } from "./description-content";
import { ReactionBar } from "./reaction-bar";
import { DescToolbar } from "./desc-toolbar";

type Props = {
  cardId: number;
  workspaceId: number;
  workspaceLabels: WorkspaceLabel[];
  onWorkspaceLabelsChange: (next: WorkspaceLabel[]) => void;
  onClose: () => void;
  onCountsChange?: (cardId: number, counts: CardCounts) => void;
  onTitleChange?: (cardId: number, title: string) => void;
  onLabelsChange?: (cardId: number, labels: CardLabel[]) => void;
  onAssigneesChange?: (cardId: number, assignees: Assignee[]) => void;
  onDueAtChange?: (cardId: number, dueAt: string | null) => void;
  onDelete?: (cardId: number) => void;
  boardColumns?: BoardColumn[];
  fields?: Record<number, FieldValue>;
  editFields?: boolean;
  /** Gates every card mutation (title, description, due, labels, assignees,
   *  checklist, attachments). Maps to the board's `edit_card` capability. */
  canEdit?: boolean;
  /** Gates the delete button. Maps to the board's `delete_card` capability. */
  canDelete?: boolean;
  onFieldChange?: (columnId: number, value: FieldValue) => void;
};

export default function CardDrawer({
  cardId,
  workspaceId,
  workspaceLabels,
  onWorkspaceLabelsChange,
  onClose,
  onCountsChange,
  onTitleChange,
  onLabelsChange,
  onAssigneesChange,
  onDueAtChange,
  onDelete,
  boardColumns,
  fields,
  editFields,
  canEdit = false,
  canDelete = false,
  onFieldChange,
}: Props) {
  const toast = useToast();
  const [data, setData] = useState<CardDetail | null>(null);
  // Latest `data` for effects that must read it without depending on it.
  const dataRef = useRef<CardDetail | null>(null);
  dataRef.current = data;
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [boardMembers, setBoardMembers] = useState<Assignee[] | null>(null);
  const [boardMembersLoading, setBoardMembersLoading] = useState(false);
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
  const { confirm } = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);

  // When a new card opens, exit any in-progress edit so the next open
  // starts from a clean read-only view.
  useEffect(() => {
    setDescEditing(false);
    setDescDragActive(false);
  }, [cardId]);

  // Seed the editor with the persisted description ONLY when entering edit
  // mode. The editor is uncontrolled from then on; React must not touch it
  // again (re-seeding on every `data` change would wipe in-progress edits —
  // bold, typing, inserted images — whenever a live update lands).
  useEffect(() => {
    if (!descEditing || !descRef.current) return;
    descRef.current.innerHTML = descriptionToHtml(
      dataRef.current?.card.description ?? "",
    );
    descRef.current.focus();
    // Make native shortcuts (Ctrl+B/I/U) emit tags rather than inline CSS.
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      // Best-effort; the serializer also handles styled spans.
    }
    // Place caret at end so the user can immediately keep typing.
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(descRef.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [descEditing]);

  // Fetch detail on mount
  useEffect(() => {
    let cancelled = false;
    setData(null);
    fetch(`/api/cards/${cardId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load card");
        const json = (await res.json()) as CardDetail;
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load card. Please try again.");
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
        else if (assigneePickerOpen) setAssigneePickerOpen(false);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pickerOpen, assigneePickerOpen]);

  // Live updates: subscribe to per-card SSE so a teammate's new
  // comment shows up without a refresh. We dedupe by id because our
  // own POST already updates state optimistically and the bus echoes
  // it back to us too.
  useEffect(() => {
    const es = new EventSource(`/api/cards/${cardId}/stream`);
    es.onmessage = (e) => {
      let event: unknown;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }
      const ev = event as {
        type: string;
        comment?: Comment;
        commentId?: number;
        body?: string;
        updatedAt?: string;
        kind?: "task" | "comment";
        targetId?: number;
        reactions?: Reaction[];
      };
      if (ev.type === "comment_created" && ev.comment) {
        const incoming = ev.comment;
        setData((prev) => {
          if (!prev) return prev;
          if (prev.comments.some((c) => c.id === incoming.id)) return prev;
          return { ...prev, comments: [...prev.comments, incoming] };
        });
      } else if (
        ev.type === "comment_updated" &&
        ev.commentId != null &&
        ev.body != null
      ) {
        const id = ev.commentId;
        const body = ev.body;
        const updatedAt = ev.updatedAt ?? null;
        setData((prev) =>
          prev
            ? {
                ...prev,
                comments: prev.comments.map((c) =>
                  c.id === id ? { ...c, body, updatedAt } : c,
                ),
              }
            : prev,
        );
      } else if (ev.type === "comment_deleted" && ev.commentId != null) {
        const id = ev.commentId;
        setData((prev) =>
          prev
            ? { ...prev, comments: prev.comments.filter((c) => c.id !== id) }
            : prev,
        );
      } else if (ev.type === "reaction_updated" && ev.kind && ev.targetId != null && ev.reactions) {
        const { kind, targetId, reactions } = ev;
        setData((prev) => {
          if (!prev) return prev;
          if (kind === "task" && targetId === cardId) {
            return { ...prev, taskReactions: reactions };
          }
          if (kind === "comment") {
            return {
              ...prev,
              comments: prev.comments.map((c) =>
                c.id === targetId ? { ...c, reactions } : c,
              ),
            };
          }
          return prev;
        });
      }
    };
    return () => {
      es.close();
    };
  }, [cardId]);

  // Load board members once the card is loaded — both the assignee
  // picker and the @-mention picker need them, and the comment renderer
  // uses them to resolve <@id> tokens to display names.
  useEffect(() => {
    const boardId = data?.card.boardId;
    if (!boardId || boardMembers !== null) return;
    setBoardMembersLoading(true);
    fetch(`/api/boards/${boardId}/members`)
      .then((r) => r.json())
      .then((json) => {
        const members = (json.members ?? []) as Array<{
          userId: number;
          firstname: string | null;
          lastname: string | null;
          email: string | null;
        }>;
        setBoardMembers(
          members.map((m) => ({
            userId: m.userId,
            firstname: m.firstname,
            lastname: m.lastname,
            email: m.email,
          })),
        );
      })
      .catch(() => toast.error("Could not load board members."))
      .finally(() => setBoardMembersLoading(false));
  }, [boardMembers, data?.card.boardId]);

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
      comments: data.comments.length,
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
        if (!res.ok) toast.error("Could not save title");
      } catch {
        toast.error("Network error. Title not saved.");
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
    try {
      const res = await fetch(`/api/tasks/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || "Could not save description");
        return;
      }
      setData((prev) => (prev ? { ...prev, card: { ...prev.card, description: next } } : prev));
      setDescEditing(false);
    } catch {
      toast.error("Network error. Description not saved.");
    } finally {
      setDescSaving(false);
    }
  };

  const applyCommand = (command: string, value?: string) => {
    descRef.current?.focus();
    // Prefer semantic tags (<b>, <i>…) over inline CSS so serialization keeps
    // the formatting.
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      // Not all engines expose this; the serializer also handles styled spans.
    }
    document.execCommand(command, false, value);
  };

  // Insert an emoji at the caret of the description editor. Uses the same
  // execCommand path as paste (line ~547) so the caret lands correctly and
  // undo/redo keeps working — no fragile manual Range juggling.
  const insertEmojiIntoDescription = (emoji: string) => {
    descRef.current?.focus();
    document.execCommand("insertText", false, emoji);
  };

  // Upload a single image and push the new attachment to local state so
  // the Images section reflects it. Returns the public URL on success.
  const uploadImageForDescription = async (file: File): Promise<{ url: string; alt: string } | null> => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are allowed");
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
        toast.error(json.error || "Upload failed");
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
      toast.error("Network error. Upload failed.");
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

  // Toolbar image button: same upload + insert flow as paste/drop, just a
  // friendlier entry point.
  const pickAndInsertImage = async (file: File) => {
    const up = await uploadImageForDescription(file);
    if (up) insertImageAtCursor(up.url, up.alt);
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
  // Shared add path. Accepts one or many titles so we can create one
  // sub-task per pasted line in a single user action.
  const createItems = async (rawTitles: string[]) => {
    if (!data) return;
    const titles = rawTitles.map((s) => s.trim()).filter(Boolean);
    if (titles.length === 0) return;

    setAdding(true);

    let nextPos = data.items.at(-1)?.position ?? 0;
    const baseId = -Date.now();
    const optimistic: Item[] = titles.map((title, i) => ({
      id: baseId - i,
      title,
      done: 0,
      position: ++nextPos,
    }));
    const snapshot = data;
    setData({ ...data, items: [...data.items, ...optimistic] });

    try {
      // Sequential so each insert sees the previous one's position and the
      // server can re-pack cleanly. The optimistic items keep the UI lively.
      for (const opt of optimistic) {
        const res = await fetch(`/api/cards/${cardId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: opt.title }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          toast.error(json.error || "Could not add some items");
          break;
        }
        const json = await res.json();
        setData((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((i) => (i.id === opt.id ? (json.item as Item) : i)),
              }
            : prev,
        );
      }
    } catch {
      setData(snapshot);
      toast.error("Network error.");
    } finally {
      setAdding(false);
    }
  };

  const onAddItem = (e: FormEvent) => {
    e.preventDefault();
    const text = newItem;
    setNewItem("");
    void createItems([text]);
  };

  // Pasting multi-line text into the composer creates one sub-task per
  // line. The text currently typed in the input (if any) gets merged into
  // the first new line so nothing is lost.
  const onItemPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !/\r?\n/.test(text)) return; // single-line: default paste
    e.preventDefault();
    const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const typed = newItem.trim();
    const all = typed ? [`${typed} ${lines[0]}`, ...lines.slice(1)] : lines;
    setNewItem("");
    void createItems(all);
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
        if (!res.ok) toast.error("Could not save change");
      } catch {
        toast.error("Network error.");
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
        toast.error("Could not update item");
      }
    } catch {
      toast.error("Network error.");
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
        toast.error("Could not delete item");
      }
    } catch {
      toast.error("Network error.");
    }
  };

  // --- Attachments ---
  const uploadFile = async (file: File) => {
    if (!data) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are allowed");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/cards/${cardId}/attachments`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Upload failed");
        return;
      }
      setData((prev) =>
        prev
          ? { ...prev, attachments: [...prev.attachments, json.attachment as Attachment] }
          : prev,
      );
    } catch {
      toast.error("Network error. Upload failed.");
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
        toast.error("Could not delete image");
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
      toast.error("Network error.");
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
        toast.error(json.error || "Could not update labels");
      }
    } catch {
      toast.error("Network error.");
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
        toast.error(json.error || "Could not create label");
        return;
      }
      const next: WorkspaceLabel = { ...json.label };
      onWorkspaceLabelsChange([...workspaceLabels, next]);
    } catch {
      toast.error("Network error.");
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
        toast.error(json.error || "Could not update label");
      }
    } catch {
      onWorkspaceLabelsChange(workspaceLabels);
      toast.error("Network error.");
    }
  };

  const onDeleteLabel = async (label: WorkspaceLabel) => {
    const ok = await confirm({
      title: `Delete label "${label.title}"?`,
      message: "It will be removed from every card in this workspace.",
      confirmLabel: "Delete label",
      danger: true,
    });
    if (!ok) return;
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
        toast.error("Could not delete label");
      }
    } catch {
      onWorkspaceLabelsChange(snapshot);
      toast.error("Network error.");
    }
  };

  // --- Assignees ---
  const persistAssignees = async (next: Assignee[]) => {
    try {
      const res = await fetch(`/api/cards/${cardId}/assignees`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: next.map((a) => a.userId) }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || "Could not update assignees");
      }
    } catch {
      toast.error("Network error.");
    }
  };

  const onToggleAssignee = (member: Assignee) => {
    if (!data) return;
    const has = data.assignees.some((a) => a.userId === member.userId);
    const next = has
      ? data.assignees.filter((a) => a.userId !== member.userId)
      : [...data.assignees, member];
    setData({ ...data, assignees: next });
    onAssigneesChange?.(cardId, next);
    persistAssignees(next);
  };

  // --- Due date ---
  const onChangeDueAt = async (next: string | null) => {
    if (!data) return;
    const snapshot = data.card.dueAt ?? null;
    setData({ ...data, card: { ...data.card, dueAt: next } });
    onDueAtChange?.(cardId, next);
    try {
      const res = await fetch(`/api/tasks/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueAt: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setData((prev) => (prev ? { ...prev, card: { ...prev.card, dueAt: snapshot } } : prev));
        onDueAtChange?.(cardId, snapshot);
        toast.error(json.error || "Could not update due date");
      }
    } catch {
      setData((prev) => (prev ? { ...prev, card: { ...prev.card, dueAt: snapshot } } : prev));
      onDueAtChange?.(cardId, snapshot);
      toast.error("Network error.");
    }
  };

  // --- Comments ---
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [editEmojiOpen, setEditEmojiOpen] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const composerEmojiBtnRef = useRef<HTMLButtonElement>(null);
  const editEmojiBtnRef = useRef<HTMLButtonElement>(null);

  // Mentions: when the user picks a board member from the @-popover we
  // insert their display name into the textarea and remember the
  // mapping. On submit we substitute each name with a <@id> token in
  // first-match order, so the stored body survives a rename.
  type MentionRef = { name: string; userId: number };
  const [mentions, setMentions] = useState<MentionRef[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const memberDirectory = useMemo(() => {
    const m = new Map<number, Assignee>();
    for (const u of boardMembers ?? []) m.set(u.userId, u);
    // Authors of existing comments may have left the board; keep their
    // names available for the renderer so an old <@id> doesn't become
    // "Unknown".
    for (const c of data?.comments ?? []) {
      if (!m.has(c.userId)) {
        m.set(c.userId, {
          userId: c.userId,
          firstname: c.firstname,
          lastname: c.lastname,
          email: c.email,
        });
      }
    }
    return m;
  }, [boardMembers, data?.comments]);

  const filteredMentionCandidates = useMemo(() => {
    const list = boardMembers ?? [];
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return list.slice(0, 8);
    return list
      .filter((u) => nameForAssignee(u).toLowerCase().includes(q))
      .slice(0, 8);
  }, [boardMembers, mentionQuery]);

  /**
   * Detect an in-progress @-mention at the caret. Returns the start
   * index of the "@" trigger if one is active, otherwise null. Closes
   * the picker if the trigger isn't preceded by whitespace or the
   * query contains whitespace.
   */
  function detectMentionTrigger(textarea: HTMLTextAreaElement): {
    start: number;
    query: string;
  } | null {
    const value = textarea.value;
    const caret = textarea.selectionStart ?? value.length;
    const upToCaret = value.slice(0, caret);
    const at = upToCaret.lastIndexOf("@");
    if (at === -1) return null;
    const prev = at === 0 ? "" : value[at - 1];
    if (prev && !/\s/.test(prev)) return null;
    const query = upToCaret.slice(at + 1);
    if (/\s/.test(query)) return null;
    return { start: at, query };
  }

  const onComposerChange = (next: string) => {
    setNewComment(next);
    const ta = composerRef.current;
    if (!ta) return;
    // Wait for React to apply the value, then re-read the caret.
    requestAnimationFrame(() => {
      const trig = detectMentionTrigger(ta);
      if (trig) {
        setMentionOpen(true);
        setMentionQuery(trig.query);
        setMentionIndex(0);
      } else if (mentionOpen) {
        setMentionOpen(false);
        setMentionQuery("");
      }
    });
  };

  const insertMention = (member: Assignee) => {
    const ta = composerRef.current;
    if (!ta) return;
    const value = ta.value;
    const caret = ta.selectionStart ?? value.length;
    const trig = detectMentionTrigger(ta);
    if (!trig) return;
    const name = nameForAssignee(member);
    const before = value.slice(0, trig.start);
    const after = value.slice(caret);
    const inserted = `@${name} `;
    const nextValue = before + inserted + after;
    setNewComment(nextValue);
    setMentions((prev) => [...prev, { name, userId: member.userId }]);
    setMentionOpen(false);
    setMentionQuery("");
    // Restore caret right after the inserted name + space.
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  function insertEmojiInTextarea(
    ta: HTMLTextAreaElement | null,
    currentValue: string,
    onChange: (v: string) => void,
    emoji: string,
  ) {
    if (!ta) { onChange(currentValue + emoji); return; }
    const start = ta.selectionStart ?? currentValue.length;
    const end = ta.selectionEnd ?? currentValue.length;
    const next = currentValue.slice(0, start) + emoji + currentValue.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.selectionStart = start + emoji.length;
      ta.selectionEnd = start + emoji.length;
      ta.focus();
    });
  }

  async function toggleTaskReaction(emoji: string) {
    const userId = data?.currentUserId;
    if (!userId) return;
    const existing = (data?.taskReactions ?? []).find((r) => r.emoji === emoji);
    const hasMyReaction = existing?.userIds.includes(userId) ?? false;
    setData((prev) => {
      if (!prev) return prev;
      let next = prev.taskReactions ?? [];
      if (hasMyReaction) {
        next = next
          .map((r) => r.emoji === emoji ? { ...r, userIds: r.userIds.filter((id) => id !== userId) } : r)
          .filter((r) => r.userIds.length > 0);
      } else {
        const hit = next.find((r) => r.emoji === emoji);
        next = hit
          ? next.map((r) => r.emoji === emoji ? { ...r, userIds: [...r.userIds, userId] } : r)
          : [...next, { emoji, userIds: [userId] }];
      }
      return { ...prev, taskReactions: next };
    });
    try {
      await fetch(`/api/cards/${cardId}/reactions`, {
        method: hasMyReaction ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch {
      toast.error("Could not update reaction");
    }
  }

  async function toggleCommentReaction(commentId: number, emoji: string) {
    const userId = data?.currentUserId;
    if (!userId) return;
    const comment = data?.comments.find((c) => c.id === commentId);
    const existing = (comment?.reactions ?? []).find((r) => r.emoji === emoji);
    const hasMyReaction = existing?.userIds.includes(userId) ?? false;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        comments: prev.comments.map((c) => {
          if (c.id !== commentId) return c;
          let reactions = c.reactions ?? [];
          if (hasMyReaction) {
            reactions = reactions
              .map((r) => r.emoji === emoji ? { ...r, userIds: r.userIds.filter((id) => id !== userId) } : r)
              .filter((r) => r.userIds.length > 0);
          } else {
            const hit = reactions.find((r) => r.emoji === emoji);
            reactions = hit
              ? reactions.map((r) => r.emoji === emoji ? { ...r, userIds: [...r.userIds, userId] } : r)
              : [...reactions, { emoji, userIds: [userId] }];
          }
          return { ...c, reactions };
        }),
      };
    });
    try {
      await fetch(`/api/comments/${commentId}/reactions`, {
        method: hasMyReaction ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch {
      toast.error("Could not update reaction");
    }
  }

  /**
   * Replace each tracked @Name with its <@id> token in first-match
   * order, so duplicates get the right id. Untracked @text stays
   * literal and won't trigger a notification.
   */
  function applyMentionTokens(body: string, refs: MentionRef[]): string {
    let out = body;
    for (const ref of refs) {
      const literal = `@${ref.name}`;
      const idx = out.indexOf(literal);
      if (idx === -1) continue;
      out = out.slice(0, idx) + `<@${ref.userId}>` + out.slice(idx + literal.length);
    }
    return out;
  }

  const postComment = async () => {
    if (!data) return;
    const text = newComment.trim();
    if (!text || postingComment) return;
    const bodyToSend = applyMentionTokens(text, mentions);
    setPostingComment(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: bodyToSend }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Could not post comment");
        return;
      }
      // The SSE bus echoes our own POST back, so dedupe by id — without
      // this the optimistic insert and the live event race and we end
      // up with the same comment twice (which also doubled the count
      // badge on the kanban card).
      const created = json.comment as Comment;
      setData((prev) => {
        if (!prev) return prev;
        if (prev.comments.some((c) => c.id === created.id)) return prev;
        return { ...prev, comments: [...prev.comments, created] };
      });
      setNewComment("");
      setMentions([]);
      setMentionOpen(false);
    } catch {
      toast.error("Network error.");
    } finally {
      setPostingComment(false);
    }
  };

  const startEditComment = (c: Comment) => {
    setEditingCommentId(c.id);
    setEditCommentBody(c.body ?? "");
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditCommentBody("");
  };

  const saveEditComment = async () => {
    if (!data || editingCommentId == null) return;
    const text = editCommentBody.trim();
    if (!text) return;
    const id = editingCommentId;
    const snapshot = data.comments;
    setData({
      ...data,
      comments: data.comments.map((c) =>
        c.id === id ? { ...c, body: text, updatedAt: new Date().toISOString() } : c,
      ),
    });
    setEditingCommentId(null);
    setEditCommentBody("");
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setData((prev) => (prev ? { ...prev, comments: snapshot } : prev));
        toast.error(json.error || "Could not update comment");
      }
    } catch {
      setData((prev) => (prev ? { ...prev, comments: snapshot } : prev));
      toast.error("Network error.");
    }
  };

  const deleteComment = async (c: Comment) => {
    if (!data) return;
    const ok = await confirm({
      title: "Delete this comment?",
      message: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const snapshot = data.comments;
    setData({ ...data, comments: data.comments.filter((x) => x.id !== c.id) });
    try {
      const res = await fetch(`/api/comments/${c.id}`, { method: "DELETE" });
      if (!res.ok) {
        setData((prev) => (prev ? { ...prev, comments: snapshot } : prev));
        toast.error("Could not delete comment");
      }
    } catch {
      setData((prev) => (prev ? { ...prev, comments: snapshot } : prev));
      toast.error("Network error.");
    }
  };

  // --- Delete the whole card ---
  const onDeleteCard = async () => {
    if (!data) return;
    const ok = await confirm({
      title: "Delete this card?",
      message: "Its sub-tasks and uploaded images will be removed too. This cannot be undone.",
      confirmLabel: "Delete card",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/tasks/${cardId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete card");
        return;
      }
      onDelete?.(cardId);
      onClose();
    } catch {
      toast.error("Network error.");
    }
  };

  // --- Copy a deep link to this card ---
  // TasksClient keeps the open card in the URL as ?card=:id, so the current
  // location already points straight at this card.
  const onCopyLink = async () => {
    const url =
      typeof window !== "undefined"
        ? window.location.href
        : `/boards/${data?.card.boardId ?? ""}?card=${cardId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
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
              canEdit ? (
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
                <h2 className={styles.headTitle} style={{ margin: 0 }}>
                  {data.card.title || "Untitled"}
                </h2>
              )
            ) : (
              <div className={styles.loadBlock} style={{ width: "70%" }} />
            )}
            {data && (
              <div className={styles.headControls}>
                {(canEdit || data.assignees.length > 0) && (
                <MetaPopover
                  open={assigneePickerOpen}
                  setOpen={setAssigneePickerOpen}
                  disabled={!canEdit}
                  label="Assignees"
                  triggerClassName={styles.metaTrigger}
                  trigger={
                    data.assignees.length === 0 ? (
                      <span className={styles.metaEmpty}>
                        <UsersIcon size={15} />
                        <span>Assign</span>
                      </span>
                    ) : (
                      <span className={styles.metaPips}>
                        {data.assignees.slice(0, 4).map((a) => (
                          <span
                            key={a.userId}
                            className={styles.metaPip}
                            title={nameForAssignee(a)}
                          >
                            {initialsForAssignee(a)}
                          </span>
                        ))}
                        {data.assignees.length > 4 && (
                          <span className={styles.metaPipMore}>
                            +{data.assignees.length - 4}
                          </span>
                        )}
                      </span>
                    )
                  }
                >
                  <AssigneePicker
                    members={boardMembers ?? []}
                    loading={boardMembersLoading}
                    selected={new Set(data.assignees.map((a) => a.userId))}
                    onToggle={onToggleAssignee}
                  />
                </MetaPopover>
                )}

                {(canEdit || data.labels.length > 0) && (
                <MetaPopover
                  open={pickerOpen}
                  setOpen={setPickerOpen}
                  disabled={!canEdit}
                  label="Labels"
                  triggerClassName={styles.metaTrigger}
                  trigger={
                    data.labels.length === 0 ? (
                      <span className={styles.metaEmpty}>
                        <TagIcon size={15} />
                        <span>Label</span>
                      </span>
                    ) : (
                      <span className={styles.metaChips}>
                        {data.labels.map((l) => {
                          const c = colorForName(l.color);
                          return (
                            <span
                              key={l.id}
                              className={styles.metaChip}
                              style={{ background: c.soft, color: c.hue }}
                            >
                              <span
                                className={styles.metaChipDot}
                                style={{ background: c.hue }}
                                aria-hidden
                              />
                              {l.title}
                            </span>
                          );
                        })}
                      </span>
                    )
                  }
                >
                  <LabelsPicker
                    workspaceLabels={workspaceLabels}
                    selected={new Set(data.labels.map((l) => l.id))}
                    canManage={data.canManageLabels ?? false}
                    onToggle={onToggleLabel}
                    onCreate={onCreateLabel}
                    onEdit={onEditLabel}
                    onDelete={onDeleteLabel}
                  />
                </MetaPopover>
                )}
              </div>
            )}
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {data && (
          <div className={styles.actionBar} role="toolbar" aria-label="Card actions">
            <MetaPopover
              open={dueOpen}
              setOpen={setDueOpen}
              disabled={!canEdit}
              label="Due date"
              triggerClassName={styles.actionBtn}
              trigger={
                <span className={styles.actionBtnInner}>
                  <CalendarIcon size={15} />
                  <span>
                    {data.card.dueAt
                      ? new Date(data.card.dueAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "Due date"}
                  </span>
                </span>
              }
            >
              <div className={styles.duePopover}>
                <input
                  type="datetime-local"
                  className={styles.dueInput}
                  value={toLocalDatetimeValue(data.card.dueAt)}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChangeDueAt(v ? new Date(v).toISOString() : null);
                  }}
                />
                {data.card.dueAt && (
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => {
                      onChangeDueAt(null);
                      setDueOpen(false);
                    }}
                  >
                    Clear due date
                  </button>
                )}
              </div>
            </MetaPopover>

            <button
              type="button"
              className={styles.actionBtn}
              onClick={onCopyLink}
            >
              <span className={styles.actionBtnInner}>
                <LinkIcon size={15} />
                <span>Copy link</span>
              </span>
            </button>

            <span className={styles.actionBarSpacer} />

            {canDelete && (
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                onClick={onDeleteCard}
              >
                <span className={styles.actionBtnInner}>
                  <TrashIcon size={15} />
                  <span>Delete</span>
                </span>
              </button>
            )}
          </div>
        )}

        {!data ? (
          <div className={styles.loading}>
            <div className={styles.loadBlock} style={{ width: "30%" }} />
            <div className={styles.loadBlock} style={{ height: 60 }} />
            <div className={styles.loadBlock} style={{ width: "30%", marginTop: "1rem" }} />
            <div className={styles.loadBlock} style={{ height: 120 }} />
          </div>
        ) : (
          <div className={styles.body}>
            {data.links && data.links.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionLabel}>Linked code</span>
                  <span className={styles.sectionCount}>{data.links.length}</span>
                </div>
                <ul className={styles.linkList}>
                  {data.links.map((l) => (
                    <li key={l.id}>
                      <a
                        className={styles.linkRow}
                        href={l.url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span className={styles.linkKind} data-kind={l.kind}>
                          {l.kind === "pr" ? "PR" : l.kind === "branch" ? "⎇" : "◇"}
                        </span>
                        <span className={styles.linkTitle}>
                          {l.title || (l.kind === "pr" ? `Pull request #${l.ref}` : l.ref)}
                        </span>
                        <span className={styles.linkRef}>
                          {l.kind === "commit" ? l.ref.slice(0, 7) : `#${l.ref}`}
                        </span>
                        {l.state && (
                          <span className={styles.linkState} data-state={l.state}>
                            {l.state}
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {boardColumns && boardColumns.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionLabel}>Fields</span>
                </div>
                <div className={styles.fieldGrid}>
                  {[...boardColumns]
                    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                    .map((col) => (
                      <div className={styles.fieldRow} key={col.id}>
                        <span className={styles.fieldRowLabel}>{col.label}</span>
                        <div className={styles.fieldRowValue}>
                          <FieldCell
                            col={col}
                            value={fields?.[col.id] ?? null}
                            editable={Boolean(editFields)}
                            onChange={(v) => onFieldChange?.(col.id, v)}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            )}

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionLabel}>Description</span>
                {!descEditing && canEdit && (
                  <DescMenu
                    hasContent={Boolean(data.card.description?.trim())}
                    onEdit={enterEdit}
                    onClear={async () => {
                      const ok = await confirm({
                        title: "Clear this description?",
                        message: "The content will be removed. You can write a new one any time.",
                        confirmLabel: "Clear",
                        danger: true,
                      });
                      if (!ok) return;
                      try {
                        const res = await fetch(`/api/tasks/${cardId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ description: "" }),
                        });
                        if (!res.ok) {
                          toast.error("Could not clear description");
                          return;
                        }
                        setData((prev) =>
                          prev ? { ...prev, card: { ...prev.card, description: "" } } : prev,
                        );
                      } catch {
                        toast.error("Network error.");
                      }
                    }}
                  />
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
                  <DescToolbar
                    onCmd={applyCommand}
                    onPickImage={pickAndInsertImage}
                    onInsertEmoji={insertEmojiIntoDescription}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    saving={descSaving}
                  />
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
                <>
                  <DescriptionView
                    text={data.card.description ?? ""}
                    onEdit={enterEdit}
                    canEdit={canEdit}
                  />
                  <ReactionBar
                    reactions={data.taskReactions ?? []}
                    currentUserId={data.currentUserId}
                    onToggle={toggleTaskReaction}
                  />
                </>
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
                        onClick={() => canEdit && onToggleItem(it.id, it.done)}
                        disabled={!canEdit}
                        aria-label="Toggle item"
                      />
                      {canEdit ? (
                        <input
                          className={`${styles.itemTitle} ${it.done ? styles.itemTitleDone : ""}`}
                          defaultValue={it.title || ""}
                          onChange={(e) => onRenameItem(it.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      ) : (
                        <span
                          className={`${styles.itemTitle} ${it.done ? styles.itemTitleDone : ""}`}
                        >
                          {it.title || ""}
                        </span>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          className={styles.itemDel}
                          onClick={() => onDeleteItem(it.id)}
                          aria-label="Delete item"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
                <form className={styles.composer} onSubmit={onAddItem}>
                  <input
                    className={styles.composerInput}
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onPaste={onItemPaste}
                    placeholder="Add a sub-task and press enter (paste a list to add many)"
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
              )}
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
                      {canEdit && (
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
                      )}
                    </a>
                  ))}
                </div>
              )}

              {canEdit && (
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
              )}

              {!canEdit && data.attachments.length === 0 && (
                <div className={styles.descEmpty}>No images.</div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionLabel}>Comments</span>
                <span className={styles.sectionCount}>{data.comments.length}</span>
              </div>

              {data.comments.length > 0 && (
                <ul className={styles.commentList}>
                  {data.comments.map((c) => {
                    const isOwn = c.userId === data.currentUserId;
                    // Highlight comments that mention the connected user.
                    const mentionsMe =
                      data.currentUserId != null &&
                      (c.body ?? "").includes(`<@${data.currentUserId}>`);
                    const isAdmin = (data.capabilities ?? []).includes("manage_board_members");
                    const canEdit = isOwn;
                    const canDelete = isOwn || isAdmin;
                    const isEditing = editingCommentId === c.id;
                    return (
                      <li key={c.id} className={styles.commentItem}>
                        <span className={styles.commentPip}>{initialsForAssignee({ userId: c.userId, firstname: c.firstname, lastname: c.lastname, email: c.email })}</span>
                        <div
                          className={
                            mentionsMe
                              ? `${styles.commentMain} ${styles.commentMainMention}`
                              : styles.commentMain
                          }
                        >
                          <div className={styles.commentMeta}>
                            <span className={styles.commentAuthor}>{nameForAssignee({ userId: c.userId, firstname: c.firstname, lastname: c.lastname, email: c.email })}</span>
                            <span className={styles.commentTime}>
                              {formatCommentTime(c.createdAt)}
                              {c.updatedAt && c.createdAt && c.updatedAt !== c.createdAt && " · edited"}
                            </span>
                          </div>
                          {isEditing ? (
                            <div className={styles.commentEditWrap}>
                              <textarea
                                ref={editTextareaRef}
                                className={styles.commentInput}
                                value={editCommentBody}
                                onChange={(e) => setEditCommentBody(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    saveEditComment();
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelEditComment();
                                  }
                                }}
                                rows={3}
                                maxLength={5000}
                                autoFocus
                              />
                              <div className={styles.commentActions}>
                                <div style={{ marginRight: "auto" }}>
                                  <button
                                    ref={editEmojiBtnRef}
                                    type="button"
                                    className={styles.emojiTrigger}
                                    title="Add emoji"
                                    onMouseDown={(e) => { e.preventDefault(); setEditEmojiOpen((v) => !v); }}
                                  >
                                    😊
                                  </button>
                                  {editEmojiOpen && (
                                    <EmojiPicker
                                      anchor={editEmojiBtnRef.current}
                                      onSelect={(emoji) => {
                                        insertEmojiInTextarea(editTextareaRef.current, editCommentBody, setEditCommentBody, emoji);
                                        setEditEmojiOpen(false);
                                      }}
                                      onClose={() => setEditEmojiOpen(false)}
                                    />
                                  )}
                                </div>
                                <button type="button" className={styles.commentBtnGhost} onClick={cancelEditComment}>
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className={styles.commentBtnPrimary}
                                  onClick={saveEditComment}
                                  disabled={!editCommentBody.trim()}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={styles.commentBody}>
                                <CommentBody
                                  body={c.body ?? ""}
                                  directory={memberDirectory}
                                  currentUserId={data.currentUserId}
                                />
                              </div>
                              {(canEdit || canDelete) && (
                                <div className={styles.commentTools}>
                                  {canEdit && (
                                    <button
                                      type="button"
                                      className={styles.commentToolBtn}
                                      onClick={() => startEditComment(c)}
                                    >
                                      Edit
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      type="button"
                                      className={`${styles.commentToolBtn} ${styles.commentToolBtnDanger}`}
                                      onClick={() => deleteComment(c)}
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              )}
                              <ReactionBar
                                reactions={c.reactions ?? []}
                                currentUserId={data.currentUserId}
                                onToggle={(emoji) => toggleCommentReaction(c.id, emoji)}
                              />
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className={styles.commentComposer}>
                <textarea
                  ref={composerRef}
                  className={styles.commentInput}
                  placeholder="Write a comment… type @ to mention someone"
                  value={newComment}
                  onChange={(e) => onComposerChange(e.target.value)}
                  onKeyUp={() => {
                    const ta = composerRef.current;
                    if (!ta) return;
                    const trig = detectMentionTrigger(ta);
                    if (trig) {
                      if (!mentionOpen) setMentionOpen(true);
                      setMentionQuery(trig.query);
                    } else if (mentionOpen) {
                      setMentionOpen(false);
                    }
                  }}
                  rows={3}
                  maxLength={5000}
                  onKeyDown={(e) => {
                    if (mentionOpen && filteredMentionCandidates.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setMentionIndex((i) => (i + 1) % filteredMentionCandidates.length);
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setMentionIndex(
                          (i) =>
                            (i - 1 + filteredMentionCandidates.length) %
                            filteredMentionCandidates.length,
                        );
                        return;
                      }
                      if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        insertMention(filteredMentionCandidates[mentionIndex]);
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setMentionOpen(false);
                        return;
                      }
                    }
                    if (e.key === "Enter" && !e.shiftKey && !mentionOpen) {
                      e.preventDefault();
                      postComment();
                    }
                  }}
                />
                {mentionOpen && filteredMentionCandidates.length > 0 && (
                  <div className={styles.mentionPicker} role="listbox">
                    {filteredMentionCandidates.map((m, i) => (
                      <button
                        key={m.userId}
                        type="button"
                        role="option"
                        aria-selected={i === mentionIndex}
                        className={`${styles.mentionRow} ${
                          i === mentionIndex ? styles.mentionRowActive : ""
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertMention(m);
                        }}
                        onMouseEnter={() => setMentionIndex(i)}
                      >
                        <span className={styles.commentPip}>{initialsForAssignee(m)}</span>
                        <span className={styles.mentionName}>{nameForAssignee(m)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.commentActions}>
                  <div style={{ marginRight: "auto" }}>
                    <button
                      ref={composerEmojiBtnRef}
                      type="button"
                      className={styles.emojiTrigger}
                      title="Add emoji"
                      onMouseDown={(e) => { e.preventDefault(); setComposerEmojiOpen((v) => !v); }}
                    >
                      😊
                    </button>
                    {composerEmojiOpen && (
                      <EmojiPicker
                        anchor={composerEmojiBtnRef.current}
                        onSelect={(emoji) => {
                          insertEmojiInTextarea(composerRef.current, newComment, setNewComment, emoji);
                          setComposerEmojiOpen(false);
                        }}
                        onClose={() => setComposerEmojiOpen(false)}
                      />
                    )}
                  </div>
                  <span className={styles.commentHint}>Enter to post · Shift+↵ for new line</span>
                  <button
                    type="button"
                    className={styles.commentBtnPrimary}
                    onClick={postComment}
                    disabled={!newComment.trim() || postingComment}
                  >
                    {postingComment ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        <footer className={styles.foot}>
          <span className={styles.footMeta}>
            {data ? `${data.labels.length} labels · ${stats.total} sub-tasks · ${data.attachments.length} images` : ""}
          </span>
          {canDelete && (
            <button type="button" className={styles.deleteCard} onClick={onDeleteCard}>
              Delete card
            </button>
          )}
        </footer>
      </aside>
    </>,
    document.body,
  );
}

/* Sub-components and helpers live in sibling modules:
 *   - ./pickers            LabelsPicker, AssigneePicker, MetaPopover, CommentBody
 *   - ./description-view   DescMenu, DescriptionView, ReactionBar, DescToolbar
 *   - ./description-markdown   markdown <-> HTML converters
 *   - ./format             pure formatting helpers
 *   - ./types              shared data types
 */

