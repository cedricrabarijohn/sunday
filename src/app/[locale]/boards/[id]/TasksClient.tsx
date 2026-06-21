"use client";

import {
  CSSProperties,
  DragEvent,
  FormEvent,
  Fragment,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { colorForName } from "@/lib/palette";
import { useConfirm } from "@/components/organisms/confirm-dialog/ConfirmDialog";
import CardDrawer, { CardCounts } from "@/components/organisms/card-drawer/CardDrawer";
import AssignMenu, { AssignMember } from "./AssignMenu";
import type { BoardEvent } from "@/lib/board-bus";
import { rememberLastBoard } from "@/lib/last-board";
import {
  BoardIcon,
  CalendarIcon,
  ChecklistIcon,
  CommentIcon,
  FilterIcon,
  LinkIcon,
  PaperclipIcon,
  PlugIcon,
  SettingsIcon,
  TableIcon,
  UsersIcon,
} from "@/components/Icons";
import styles from "../../workspaces/AppShell.module.scss";
import kStyles from "./Kanban.module.scss";
import { useToast } from "@/components/organisms/toast/ToastProvider";
import BoardTable from "./BoardTable";
import MovePileMenu from "./MovePileMenu";
import type { FieldConfig, FieldType } from "@/lib/fields";

export type FieldValue = string | number | boolean | string[] | null;
export type BoardColumn = {
  id: number;
  label: string | null;
  type: FieldType | string | null;
  config: FieldConfig;
  position: number | null;
};
import NotificationsBell from "../../workspaces/NotificationsBell";

export type CardLabel = { id: number; title: string; color: string };
export type CardAssignee = {
  userId: number;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
};

export type WorkspaceLabel = {
  id: number;
  title: string;
  color: string;
  position: number | null;
  isDefault: number;
};

export type Task = {
  id: number;
  title: string | null;
  pileId: number | null;
  position: number | null;
  itemsTotal: number;
  itemsDone: number;
  attachments: number;
  comments: number;
  links: number;
  labels: CardLabel[];
  assignees: CardAssignee[];
  dueAt: string | Date | null;
  fields?: Record<number, FieldValue>;
};

export type Pile = {
  id: number;
  title: string;
  color: string | null;
  position: number;
};

export type DragState = { cardId: number; fromPileId: number | null } | null;
export type DropHint = { pileId: number; beforeCardId: number | null } | null;

type BoardFilterState = {
  query: string;
  assigneeIds: Set<number>;
  labelIds: Set<number>;
  due: "any" | "withDue" | "overdue";
  // Custom-field filters: column id → selected option ids (select / multi_select).
  fields: Map<number, Set<string>>;
};

/** Total number of selected custom-field options across all fields. */
function fieldFilterCount(fields: Map<number, Set<string>>): number {
  let n = 0;
  for (const set of fields.values()) n += set.size;
  return n;
}

export default function TasksClient({
  boardId,
  boardTitle,
  workspaceId,
  workspaceTitle,
  initial,
  initialPiles,
  initialLabels,
  initialColumns,
  capabilities,
  canManageMembers,
  currentUserId,
}: {
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
  initial: Task[];
  initialPiles: Pile[];
  initialLabels: WorkspaceLabel[];
  initialColumns: BoardColumn[];
  capabilities: string[];
  canManageMembers: boolean;
  currentUserId: number;
}) {
  const caps = new Set(capabilities);
  const can = (c: string) => caps.has(c);
  const { confirm } = useConfirm();
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [piles, setPiles] = useState<Pile[]>(initialPiles);
  const [labels, setLabels] = useState<WorkspaceLabel[]>(initialLabels);
  const [columns, setColumns] = useState<BoardColumn[]>(initialColumns);
  const [title, setTitle] = useState<string>(boardTitle || "");
  const [openCardId, setOpenCardId] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const [addingPile, setAddingPile] = useState(false);
  const [addPileDragOver, setAddPileDragOver] = useState(false);

  const pileRenameTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const titleRenameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRenameTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Stack of cross-pile moves, for successive undos (toast button + Ctrl/Cmd+Z).
  // In-memory only — cleared on refresh.
  const undoStackRef = useRef<
    { cardId: number; fromPileId: number; restoreBeforeId: number | null }[]
  >([]);

  // Kanban vs. table, remembered per board. Read after mount so the
  // server render (always "board") and the first client paint agree.
  const [view, setView] = useState<"board" | "table">("board");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`sunday:boardView:${boardId}`);
      if (saved === "table" || saved === "board") setView(saved);
    } catch {
      // localStorage unavailable (private mode etc.) — stay on default.
    }
  }, [boardId]);

  // Remember this as the last viewed board so `/` can jump back here.
  useEffect(() => {
    rememberLastBoard(boardId);
  }, [boardId]);

  // The open card is reflected in the URL (/boards/:id?card=:cardId) so it
  // survives a refresh, can be shared, and opens from a notification deep link.
  // React to the `card` param so navigating to ?card=:id opens the drawer even
  // when we're already on this board (e.g. clicking a notification in place) —
  // not just on the initial mount.
  const cardParam = useSearchParams().get("card");
  useEffect(() => {
    const id = cardParam ? Number(cardParam) : NaN;
    if (Number.isFinite(id) && id > 0) setOpenCardId(id);
  }, [cardParam]);

  // Keep the ?card= param in sync with the open drawer without a full
  // navigation, preserving any other query params.
  const syncCardParam = (id: number | null) => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (id) params.set("card", String(id));
      else params.delete("card");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    } catch {
      // No History API — the drawer still works, just without the URL sync.
    }
  };
  const openCard = (id: number) => {
    if (id <= 0) return;
    setOpenCardId(id);
    syncCardParam(id);
  };
  const closeCard = () => {
    setOpenCardId(null);
    syncCardParam(null);
  };

  const changeView = (next: "board" | "table") => {
    setView(next);
    try {
      localStorage.setItem(`sunday:boardView:${boardId}`, next);
    } catch {
      // Non-fatal; the choice just won't persist.
    }
  };

  // Keep a live handle on the workspace labels so the SSE handler can
  // resolve label ids -> chips without re-subscribing on every change.
  const labelsRef = useRef(labels);
  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  // Live board sync: every open kanban view subscribes to the board's
  // event stream and folds card/pile changes into local state. Events
  // carry authoritative data, so re-applying our own echo is a no-op.
  useEffect(() => {
    const es = new EventSource(`/api/boards/${boardId}/stream`);
    es.onmessage = (e) => {
      let ev: BoardEvent | { type: "connected" };
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (ev.type) {
        case "card_created": {
          const c = ev.card;
          setTasks((prev) =>
            prev.some((t) => t.id === c.id)
              ? prev
              : [
                  ...prev,
                  {
                    id: c.id,
                    title: c.title,
                    pileId: c.pileId,
                    position: c.position,
                    itemsTotal: 0,
                    itemsDone: 0,
                    attachments: 0,
                    comments: 0,
                    links: 0,
                    labels: [],
                    assignees: [],
                    dueAt: null,
                  },
                ],
          );
          break;
        }
        case "card_moved": {
          const place = new Map<number, { pileId: number; position: number }>();
          for (const o of ev.order) {
            o.cardIds.forEach((cid, i) =>
              place.set(cid, { pileId: o.pileId, position: i + 1 }),
            );
          }
          setTasks((prev) =>
            prev.map((t) => {
              const p = place.get(t.id);
              return p ? { ...t, pileId: p.pileId, position: p.position } : t;
            }),
          );
          break;
        }
        case "card_deleted":
          setTasks((prev) => prev.filter((t) => t.id !== ev.cardId));
          break;
        case "card_updated":
          setTasks((prev) =>
            prev.map((t) =>
              t.id === ev.cardId
                ? {
                    ...t,
                    ...(ev.title !== undefined ? { title: ev.title } : {}),
                    ...(Object.prototype.hasOwnProperty.call(ev, "dueAt")
                      ? { dueAt: ev.dueAt ?? null }
                      : {}),
                  }
                : t,
            ),
          );
          break;
        case "card_labels": {
          const resolved: CardLabel[] = [];
          for (const lid of ev.labelIds) {
            const l = labelsRef.current.find((x) => x.id === lid);
            if (l) resolved.push({ id: l.id, title: l.title, color: l.color });
          }
          setTasks((prev) =>
            prev.map((t) => (t.id === ev.cardId ? { ...t, labels: resolved } : t)),
          );
          break;
        }
        case "card_assignees":
          setTasks((prev) =>
            prev.map((t) =>
              t.id === ev.cardId
                ? {
                    ...t,
                    assignees: ev.assignees.map((a) => ({
                      userId: a.userId,
                      firstname: a.firstname,
                      lastname: a.lastname,
                      email: a.email,
                    })),
                  }
                : t,
            ),
          );
          break;
        case "card_counts":
          setTasks((prev) =>
            prev.map((t) =>
              t.id === ev.cardId
                ? {
                    ...t,
                    itemsTotal: ev.itemsTotal,
                    itemsDone: ev.itemsDone,
                    attachments: ev.attachments,
                    comments: ev.comments,
                    links: ev.links,
                  }
                : t,
            ),
          );
          break;
        case "pile_created": {
          const p = ev.pile;
          setPiles((prev) =>
            prev.some((x) => x.id === p.id)
              ? prev
              : [...prev, { id: p.id, title: p.title, color: p.color, position: p.position }],
          );
          break;
        }
        case "pile_updated":
          setPiles((prev) =>
            prev.map((p) => (p.id === ev.pileId ? { ...p, title: ev.title } : p)),
          );
          break;
        case "pile_deleted":
          setPiles((prev) => prev.filter((p) => p.id !== ev.pileId));
          break;
        case "piles_reordered": {
          const rank = new Map(ev.pileIds.map((pid, i) => [pid, i]));
          setPiles((prev) =>
            [...prev]
              .map((p) => ({ ...p, position: (rank.get(p.id) ?? 0) + 1 }))
              .sort((a, b) => a.position - b.position),
          );
          break;
        }
      }
    };
    return () => es.close();
  }, [boardId]);

  const onRenameBoard = (next: string) => {
    setTitle(next);
    if (titleRenameTimer.current) clearTimeout(titleRenameTimer.current);
    if (!next.trim()) return;
    titleRenameTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/boards/${boardId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: next }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Could not rename board");
        }
      } catch {
        toast.error("Network error. Board name not saved.");
      }
    }, 400);
  };

  const cardsByPile = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const p of piles) map.set(p.id, []);
    for (const t of tasks) {
      if (t.pileId == null) continue;
      const arr = map.get(t.pileId);
      if (arr) arr.push(t);
    }
    for (const [, arr] of map) arr.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return map;
  }, [tasks, piles]);

  const [filter, setFilter] = useState<BoardFilterState>({
    query: "",
    assigneeIds: new Set<number>(),
    labelIds: new Set<number>(),
    due: "any",
    fields: new Map<number, Set<string>>(),
  });

  const queryNorm = filter.query.trim().toLowerCase();
  const filterCount =
    (queryNorm ? 1 : 0) +
    filter.assigneeIds.size +
    filter.labelIds.size +
    (filter.due === "any" ? 0 : 1) +
    fieldFilterCount(filter.fields);

  const matchesFilter = (t: Task): boolean => {
    if (queryNorm) {
      const title = (t.title ?? "").toLowerCase();
      if (!title.includes(queryNorm)) return false;
    }
    if (filter.assigneeIds.size > 0) {
      const hasOne = t.assignees.some((a) => filter.assigneeIds.has(a.userId));
      if (!hasOne) return false;
    }
    if (filter.labelIds.size > 0) {
      const hasOne = t.labels.some((l) => filter.labelIds.has(l.id));
      if (!hasOne) return false;
    }
    for (const [colId, optIds] of filter.fields) {
      if (optIds.size === 0) continue;
      const v = t.fields?.[colId];
      const hasOne = Array.isArray(v)
        ? v.some((id) => optIds.has(id))
        : typeof v === "string" && optIds.has(v);
      if (!hasOne) return false;
    }
    if (filter.due === "withDue" && !t.dueAt) return false;
    if (filter.due === "overdue") {
      if (!t.dueAt) return false;
      const tms = typeof t.dueAt === "string" ? new Date(t.dueAt).getTime() : t.dueAt.getTime();
      if (tms >= Date.now()) return false;
    }
    return true;
  };

  const visibleCardsByPile = useMemo(() => {
    if (filterCount === 0) return cardsByPile;
    const map = new Map<number, Task[]>();
    for (const [pileId, arr] of cardsByPile) {
      map.set(pileId, arr.filter(matchesFilter));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsByPile, filter, filterCount]);

  const visibleCount = useMemo(() => {
    let n = 0;
    for (const [, arr] of visibleCardsByPile) n += arr.length;
    return n;
  }, [visibleCardsByPile]);

  const allAssigneesOnBoard = useMemo(() => {
    const seen = new Map<number, CardAssignee>();
    for (const t of tasks) {
      for (const a of t.assignees) {
        if (!seen.has(a.userId)) seen.set(a.userId, a);
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      nameFor(a).localeCompare(nameFor(b)),
    );
  }, [tasks]);

  // --- card add (per pile)
  const onAddCard = async (pileId: number, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    const tempId = -Date.now();
    const existing = cardsByPile.get(pileId) ?? [];
    const nextPos = (existing.at(-1)?.position ?? 0) + 1;
    setTasks((prev) => [
      ...prev,
      {
        id: tempId,
        title: trimmed,
        pileId,
        position: nextPos,
        itemsTotal: 0,
        itemsDone: 0,
        attachments: 0,
        comments: 0,
        links: 0,
        labels: [],
        assignees: [],
        dueAt: null,
      },
    ]);

    try {
      const res = await fetch(`/api/boards/${boardId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, pileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
        toast.error(data.error || "Could not add card");
        return;
      }
      setTasks((prev) => {
        const tempCard = prev.find((t) => t.id === tempId);
        const withoutTemp = prev.filter((t) => t.id !== tempId);
        // The board stream may have already delivered this card to us.
        if (!tempCard || withoutTemp.some((t) => t.id === data.task.id)) {
          return withoutTemp;
        }
        return [
          ...withoutTemp,
          {
            ...tempCard,
            id: data.task.id,
            title: data.task.title,
            position: data.task.position,
            pileId: data.task.pileId,
          },
        ];
      });
    } catch {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      toast.error("Network error. Please try again.");
    }
  };

  // --- card delete
  const onDeleteCard = async (id: number) => {
    // Persisted cards get a confirmation; unsaved temp cards (id < 0) just go.
    if (id > 0) {
      const ok = await confirm({
        title: "Delete this card?",
        message:
          "Its sub-tasks and uploaded images will be removed too. This cannot be undone.",
        confirmLabel: "Delete card",
        danger: true,
      });
      if (!ok) return;
    }
    const snapshot = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (id < 0) return;
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setTasks(snapshot);
        toast.error("Could not delete card");
      }
    } catch {
      setTasks(snapshot);
      toast.error("Network error.");
    }
  };

  // --- inline card edits (table view)
  const onRenameCard = (id: number, title: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    if (id < 0) return;
    const existing = cardRenameTimers.current.get(id);
    if (existing) clearTimeout(existing);
    if (!title.trim()) return; // server rejects empty titles
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Could not rename card");
        }
      } catch {
        toast.error("Network error.");
      }
    }, 500);
    cardRenameTimers.current.set(id, timer);
  };

  const onSetCardDue = async (id: number, dueAt: string | null) => {
    const snapshot = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, dueAt } : t)));
    if (id < 0) return;
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueAt }),
      });
      if (!res.ok) {
        setTasks(snapshot);
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Could not set due date");
      }
    } catch {
      setTasks(snapshot);
      toast.error("Network error.");
    }
  };

  // --- drag & drop
  const onCardDragStart = (e: DragEvent<HTMLElement>, card: Task) => {
    if (card.id < 0) {
      e.preventDefault();
      return;
    }
    setDrag({ cardId: card.id, fromPileId: card.pileId });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(card.id));
  };

  const onCardDragEnd = () => {
    setDrag(null);
    setHint(null);
  };

  const onCardDragOver = (e: DragEvent<HTMLElement>, pile: Pile, card: Task) => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    if (drag.cardId === card.id) return;
    setHint({ pileId: pile.id, beforeCardId: card.id });
  };

  const onPileDragOver = (e: DragEvent<HTMLElement>, pile: Pile) => {
    if (!drag) return;
    e.preventDefault();
    setHint((prev) => {
      if (prev && prev.pileId === pile.id) return prev;
      return { pileId: pile.id, beforeCardId: null };
    });
  };

  const onPileDragLeave = (e: DragEvent<HTMLElement>, pile: Pile) => {
    if (!drag) return;
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    setHint((prev) => (prev && prev.pileId === pile.id ? null : prev));
  };

  const onPileDrop = async (e: DragEvent<HTMLElement>, pile: Pile) => {
    e.preventDefault();
    e.stopPropagation();
    if (!drag) return;
    const cardId = drag.cardId;
    const targetPileId = pile.id;
    const beforeCardId = hint?.pileId === targetPileId ? hint.beforeCardId : null;
    setDrag(null);
    setHint(null);
    await moveCard(cardId, targetPileId, beforeCardId);
  };

  const moveCard = async (
    cardId: number,
    targetPileId: number,
    beforeCardId: number | null,
    opts?: { silent?: boolean },
  ) => {
    const snapshot = tasks;
    const moved = snapshot.find((t) => t.id === cardId);
    if (!moved) return;

    // Where the card sat in its source pile, so an undo can restore the exact
    // spot (insert before whatever followed it; null = it was last).
    const movingFrom = moved.pileId;
    const isCrossPile = movingFrom !== null && movingFrom !== targetPileId;
    const sourceOrderFull = movingFrom != null ? cardsByPile.get(movingFrom) ?? [] : [];
    const movedIdx = sourceOrderFull.findIndex((c) => c.id === cardId);
    const restoreBeforeId =
      movedIdx >= 0 && movedIdx + 1 < sourceOrderFull.length
        ? sourceOrderFull[movedIdx + 1].id
        : null;

    // Build optimistic ordered list per pile
    const targetCardsBefore = (cardsByPile.get(targetPileId) ?? []).filter(
      (c) => c.id !== cardId,
    );
    let insertAt = targetCardsBefore.length;
    if (beforeCardId !== null) {
      const idx = targetCardsBefore.findIndex((c) => c.id === beforeCardId);
      insertAt = idx === -1 ? targetCardsBefore.length : idx;
    }
    const newTargetOrder = [
      ...targetCardsBefore.slice(0, insertAt),
      { ...moved, pileId: targetPileId },
      ...targetCardsBefore.slice(insertAt),
    ];

    const movingFromPile = moved.pileId;
    const sourceCardsBefore =
      movingFromPile !== null && movingFromPile !== targetPileId
        ? (cardsByPile.get(movingFromPile) ?? []).filter((c) => c.id !== cardId)
        : null;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === cardId) {
          const newIdx = newTargetOrder.findIndex((c) => c.id === cardId);
          return { ...t, pileId: targetPileId, position: newIdx + 1 };
        }
        // re-pack target pile positions
        const targetIdx = newTargetOrder.findIndex((c) => c.id === t.id);
        if (targetIdx !== -1) return { ...t, position: targetIdx + 1 };
        // re-pack source pile positions when card left
        if (sourceCardsBefore) {
          const srcIdx = sourceCardsBefore.findIndex((c) => c.id === t.id);
          if (srcIdx !== -1) return { ...t, position: srcIdx + 1 };
        }
        return t;
      }),
    );

    // afterCardId for server: the card immediately before the inserted position
    const afterCardId = insertAt === 0 ? null : newTargetOrder[insertAt - 1].id;

    try {
      const res = await fetch(`/api/tasks/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pileId: targetPileId, afterCardId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTasks(snapshot);
        toast.error(data.error || "Could not move card");
        return;
      }
      // Push an undo entry for cross-pile moves (not for in-pile reordering,
      // and not when this move IS itself an undo).
      if (isCrossPile && !opts?.silent && movingFrom !== null) {
        undoStackRef.current.push({ cardId, fromPileId: movingFrom, restoreBeforeId });
        if (undoStackRef.current.length > 50) undoStackRef.current.shift();
        const toPile = piles.find((p) => p.id === targetPileId);
        toast.info(
          `Moved “${moved.title || "card"}” to ${toPile?.title || "another pile"}`,
          {
            ttl: 6000,
            action: { label: "Undo", onClick: () => undoLastRef.current() },
          },
        );
      }
    } catch {
      setTasks(snapshot);
      toast.error("Network error.");
    }
  };

  // Pop and undo the most recent cross-pile move (silent — no toast, no new
  // undo entry). Calling it repeatedly walks back through the stack.
  const undoLast = () => {
    const rec = undoStackRef.current.pop();
    if (!rec) return;
    moveCard(rec.cardId, rec.fromPileId, rec.restoreBeforeId, { silent: true });
  };
  // Behind a ref so the toast button and the keydown handler never call a
  // stale closure.
  const undoLastRef = useRef(undoLast);
  undoLastRef.current = undoLast;

  // Ctrl/Cmd+Z undoes the last cross-pile move (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable]")) return;
      if (undoStackRef.current.length === 0) return;
      e.preventDefault();
      undoLastRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Move without dragging: drop the card at the bottom of the chosen pile.
  const onMoveToPile = (cardId: number, pileId: number) => {
    const card = tasks.find((t) => t.id === cardId);
    if (!card || card.pileId === pileId) return;
    moveCard(cardId, pileId, null);
  };

  // --- Board-view assignees ---
  // The full member list is loaded lazily the first time someone opens an
  // assign menu on a card, so we don't pay for it on every board load.
  const [boardMembers, setBoardMembers] = useState<AssignMember[] | null>(null);
  const [boardMembersLoading, setBoardMembersLoading] = useState(false);

  const loadBoardMembers = () => {
    if (boardMembers !== null || boardMembersLoading) return;
    setBoardMembersLoading(true);
    fetch(`/api/boards/${boardId}/members`)
      .then((r) => r.json())
      .then((json) => {
        const ms = ((json.members ?? []) as AssignMember[]).map((m) => ({
          userId: m.userId,
          firstname: m.firstname,
          lastname: m.lastname,
          email: m.email,
        }));
        setBoardMembers(ms);
      })
      .catch(() => toast.error("Could not load board members."))
      .finally(() => setBoardMembersLoading(false));
  };

  // Assign/unassign from the board, mirroring the card drawer: optimistic
  // update, PUT the full set, roll back on failure. The SSE `card_assignees`
  // event reconciles other clients (and this one).
  const onSetAssignees = async (cardId: number, assignees: CardAssignee[]) => {
    const snapshot = tasks.find((t) => t.id === cardId)?.assignees ?? [];
    setTasks((prev) => prev.map((t) => (t.id === cardId ? { ...t, assignees } : t)));
    try {
      const res = await fetch(`/api/cards/${cardId}/assignees`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: assignees.map((a) => a.userId) }),
      });
      if (!res.ok) {
        setTasks((prev) => prev.map((t) => (t.id === cardId ? { ...t, assignees: snapshot } : t)));
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || "Could not update assignees");
      }
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === cardId ? { ...t, assignees: snapshot } : t)));
      toast.error("Network error.");
    }
  };

  // --- Pile reordering (drag & drop + move buttons) ---
  const [pileDragId, setPileDragId] = useState<number | null>(null);
  // beforeId === null means "drop at the end"; the whole hint null means none.
  const [pileDropHint, setPileDropHint] = useState<{ beforeId: number | null } | null>(null);

  const persistPileOrder = async (orderedIds: number[]) => {
    try {
      const res = await fetch(`/api/boards/${boardId}/piles/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pileIds: orderedIds }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error || "Could not reorder piles");
        return false;
      }
      return true;
    } catch {
      toast.error("Network error.");
      return false;
    }
  };

  const applyPileOrder = (renum: Pile[]) => {
    const current = [...piles].sort((a, b) => a.position - b.position);
    if (renum.every((p, i) => p.id === current[i]?.id)) return; // no change
    const snapshot = piles;
    setPiles(renum);
    persistPileOrder(renum.map((p) => p.id)).then((ok) => {
      if (!ok) setPiles(snapshot);
    });
  };

  // Move `dragId` so it sits just before `beforeId` (or at the end when null).
  const reorderPiles = (dragId: number, beforeId: number | null) => {
    const current = [...piles].sort((a, b) => a.position - b.position);
    const dragged = current.find((p) => p.id === dragId);
    if (!dragged) return;
    const without = current.filter((p) => p.id !== dragId);
    const idx = beforeId == null ? without.length : without.findIndex((p) => p.id === beforeId);
    const insertAt = idx < 0 ? without.length : idx;
    without.splice(insertAt, 0, dragged);
    applyPileOrder(without.map((p, i) => ({ ...p, position: i + 1 })));
  };

  // Nudge a pile one slot left/right — accessible/touch-friendly alternative
  // to dragging.
  const movePile = (pileId: number, dir: -1 | 1) => {
    const current = [...piles].sort((a, b) => a.position - b.position);
    const i = current.findIndex((p) => p.id === pileId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= current.length) return;
    [current[i], current[j]] = [current[j], current[i]];
    applyPileOrder(current.map((p, k) => ({ ...p, position: k + 1 })));
  };

  const onPileReorderStart = (e: DragEvent<HTMLElement>, pileId: number) => {
    setPileDragId(pileId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-pile", String(pileId));
  };

  const onPileReorderOver = (e: DragEvent<HTMLElement>, overPile: Pile) => {
    if (pileDragId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overPile.id === pileDragId) {
      setPileDropHint(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientX > rect.left + rect.width / 2;
    const current = [...piles].sort((a, b) => a.position - b.position);
    const i = current.findIndex((p) => p.id === overPile.id);
    const beforeId = after ? current[i + 1]?.id ?? null : overPile.id;
    // Dropping right next to where it already is is a no-op — hide the hint.
    if (beforeId === pileDragId) {
      setPileDropHint(null);
      return;
    }
    setPileDropHint({ beforeId });
  };

  const onPileReorderDrop = (e: DragEvent<HTMLElement>) => {
    if (pileDragId == null) return;
    e.preventDefault();
    e.stopPropagation();
    const dragId = pileDragId;
    const hint = pileDropHint;
    setPileDragId(null);
    setPileDropHint(null);
    if (hint) reorderPiles(dragId, hint.beforeId);
  };

  const onPileReorderEnd = () => {
    setPileDragId(null);
    setPileDropHint(null);
  };

  // --- custom fields ---
  const onSetFieldValue = async (cardId: number, columnId: number, value: FieldValue) => {
    const snapshot = tasks;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === cardId ? { ...t, fields: { ...(t.fields ?? {}), [columnId]: value } } : t,
      ),
    );
    if (cardId < 0) return;
    try {
      const res = await fetch(`/api/cards/${cardId}/columns/${columnId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setTasks(snapshot);
        toast.error(d.error || "Could not save field");
      }
    } catch {
      setTasks(snapshot);
      toast.error("Network error.");
    }
  };

  const onCreateField = async (input: { label: string; type: FieldType; config?: FieldConfig }) => {
    try {
      const res = await fetch(`/api/boards/${boardId}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not add field");
        return;
      }
      setColumns((prev) => [...prev, d.column as BoardColumn]);
    } catch {
      toast.error("Network error.");
    }
  };

  const onRenameField = (columnId: number, label: string) => {
    setColumns((prev) => prev.map((c) => (c.id === columnId ? { ...c, label } : c)));
    fetch(`/api/columns/${columnId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    }).catch(() => {});
  };

  const onDeleteField = async (columnId: number) => {
    const col = columns.find((c) => c.id === columnId);
    const ok = await confirm({
      title: `Delete field “${col?.label ?? ""}”?`,
      message: "Its values on every card will be removed. This cannot be undone.",
      confirmLabel: "Delete field",
      danger: true,
    });
    if (!ok) return;
    const snap = columns;
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
    try {
      const res = await fetch(`/api/columns/${columnId}`, { method: "DELETE" });
      if (!res.ok) {
        setColumns(snap);
        toast.error("Could not delete field");
      }
    } catch {
      setColumns(snap);
      toast.error("Network error.");
    }
  };

  // --- drop a card on Add pile: create a new pile and drop the card into it
  const onDropOnAddPile = async (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!drag) return;
    const cardId = drag.cardId;
    const fromPileId = drag.fromPileId;
    setDrag(null);
    setHint(null);
    setAddPileDragOver(false);

    const tasksSnapshot = tasks;
    const pilesSnapshot = piles;

    const tempPileId = -Date.now();
    const newPileTitle = "New pile";
    const nextPos = (piles.at(-1)?.position ?? 0) + 1;

    // Optimistically add the pile and move the card
    setPiles((prev) => [
      ...prev,
      { id: tempPileId, title: newPileTitle, color: "slate", position: nextPos },
    ]);
    setTasks((prev) => {
      const remainingInSource =
        fromPileId !== null
          ? prev
              .filter((t) => t.pileId === fromPileId && t.id !== cardId)
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
              .map((t, i) => ({ ...t, position: i + 1 }))
          : [];
      return prev.map((t) => {
        if (t.id === cardId) return { ...t, pileId: tempPileId, position: 1 };
        if (fromPileId !== null && t.pileId === fromPileId) {
          const repacked = remainingInSource.find((r) => r.id === t.id);
          return repacked ?? t;
        }
        return t;
      });
    });

    try {
      const pileRes = await fetch(`/api/boards/${boardId}/piles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newPileTitle, color: "slate" }),
      });
      const pileData = await pileRes.json();
      if (!pileRes.ok) {
        setPiles(pilesSnapshot);
        setTasks(tasksSnapshot);
        toast.error(pileData.error || "Could not create pile");
        return;
      }
      const realPileId = pileData.pile.id as number;

      // Swap the temp pile id for the real one in both states
      setPiles((prev) => {
        const withoutTemp = prev.filter((p) => p.id !== tempPileId);
        // The board stream may have already delivered this pile to us.
        if (withoutTemp.some((p) => p.id === realPileId)) return withoutTemp;
        return [
          ...withoutTemp,
          { id: realPileId, title: pileData.pile.title, color: pileData.pile.color, position: pileData.pile.position },
        ];
      });
      setTasks((prev) =>
        prev.map((t) => (t.pileId === tempPileId ? { ...t, pileId: realPileId } : t)),
      );

      const moveRes = await fetch(`/api/tasks/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pileId: realPileId, afterCardId: null }),
      });
      if (!moveRes.ok) {
        const data = await moveRes.json().catch(() => ({}));
        toast.error(data.error || "Card move failed");
      }
    } catch {
      setPiles(pilesSnapshot);
      setTasks(tasksSnapshot);
      toast.error("Network error.");
    }
  };

  // --- pile create
  const onCreatePile = async (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const tempId = -Date.now();
    const nextPos = (piles.at(-1)?.position ?? 0) + 1;
    setPiles((prev) => [...prev, { id: tempId, title: trimmed, color: "slate", position: nextPos }]);
    setAddingPile(false);
    try {
      const res = await fetch(`/api/boards/${boardId}/piles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, color: "slate" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPiles((prev) => prev.filter((p) => p.id !== tempId));
        toast.error(data.error || "Could not create pile");
        return;
      }
      setPiles((prev) => {
        const withoutTemp = prev.filter((p) => p.id !== tempId);
        // The board stream may have already delivered this pile to us.
        if (withoutTemp.some((p) => p.id === data.pile.id)) return withoutTemp;
        return [
          ...withoutTemp,
          { id: data.pile.id, title: data.pile.title, color: data.pile.color, position: data.pile.position },
        ];
      });
    } catch {
      setPiles((prev) => prev.filter((p) => p.id !== tempId));
      toast.error("Network error.");
    }
  };

  // --- pile rename (debounced)
  const onRenamePile = (pileId: number, title: string) => {
    setPiles((prev) => prev.map((p) => (p.id === pileId ? { ...p, title } : p)));
    if (pileId < 0) return;
    const existing = pileRenameTimers.current.get(pileId);
    if (existing) clearTimeout(existing);
    // Empty titles aren't saved.
    if (!title.trim()) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/piles/${pileId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || "Could not rename pile");
        }
      } catch {
        toast.error("Network error.");
      }
    }, 400);
    pileRenameTimers.current.set(pileId, timer);
  };

  const onDeletePile = async (pile: Pile) => {
    const cards = cardsByPile.get(pile.id) ?? [];
    if (cards.length > 0) {
      toast.error("Move the cards out of this pile before deleting it.");
      return;
    }
    const ok = await confirm({
      title: `Delete "${pile.title}"?`,
      message: "This pile is empty, so no cards will be lost.",
      confirmLabel: "Delete pile",
      danger: true,
    });
    if (!ok) return;
    const snapshot = piles;
    setPiles((prev) => prev.filter((p) => p.id !== pile.id));
    try {
      const res = await fetch(`/api/piles/${pile.id}`, { method: "DELETE" });
      if (!res.ok) {
        setPiles(snapshot);
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Could not delete pile");
      }
    } catch {
      setPiles(snapshot);
      toast.error("Network error.");
    }
  };

  const boardColor = colorForName("indigo");
  const headerStyle = {
    "--card-hue": boardColor.hue,
    "--card-soft": boardColor.soft,
  } as CSSProperties;

  return (
    <>
      <div className={styles.pageHeader} style={headerStyle}>
        <div className={styles.pageHeaderText}>
          <span
            className={styles.pageBadge}
            style={{ background: boardColor.soft, color: boardColor.hue }}
          >
            {(title?.[0] || "B").toUpperCase()}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {can("edit_board") ? (
              <input
                className={styles.pageTitleInput}
                value={title}
                onChange={(e) => onRenameBoard(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                placeholder="Untitled board"
                maxLength={100}
                aria-label="Board name"
              />
            ) : (
              <h1 className={styles.pageTitleStatic}>{title || "Untitled board"}</h1>
            )}
            <div className={styles.pageSubtitle}>
              in{" "}
              <Link
                href={`/workspaces/${workspaceId}`}
                style={{ color: "var(--text-2)", borderBottom: "1px dotted var(--border-strong)" }}
              >
                {workspaceTitle || "workspace"}
              </Link>
            </div>
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.75rem" }}>
          <span className={styles.pageMeta}>
            {piles.length} {piles.length === 1 ? "pile" : "piles"} ·{" "}
            {filterCount > 0
              ? `${visibleCount}/${tasks.length} cards`
              : `${tasks.length} ${tasks.length === 1 ? "card" : "cards"}`}
          </span>
          <div className={kStyles.viewToggle} role="tablist" aria-label="Board view">
            <button
              type="button"
              role="tab"
              aria-selected={view === "board"}
              className={`${kStyles.viewToggleBtn} ${view === "board" ? kStyles.viewToggleBtnActive : ""}`}
              onClick={() => changeView("board")}
              title="Board view"
            >
              <BoardIcon size={15} />
              <span className={kStyles.viewToggleLabel}>Board</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "table"}
              className={`${kStyles.viewToggleBtn} ${view === "table" ? kStyles.viewToggleBtnActive : ""}`}
              onClick={() => changeView("table")}
              title="Table view"
            >
              <TableIcon size={15} />
              <span className={kStyles.viewToggleLabel}>Table</span>
            </button>
          </div>
          <BoardFilter
            filter={filter}
            setFilter={setFilter}
            allAssignees={allAssigneesOnBoard}
            allLabels={labels}
            columns={columns}
            currentUserId={currentUserId}
          />
          <BoardActionsMenu
            boardId={boardId}
            workspaceId={workspaceId}
            canManageMembers={canManageMembers}
          />
          {/* On mobile the bell lives in the AppShell top bar instead. */}
          <span className={styles.bellDesktopOnly}>
            <NotificationsBell />
          </span>
        </div>
      </div>

      <div className={kStyles.board}>
        {piles.length === 0 && !addingPile && (
          <div className={kStyles.emptyBoard}>
            <div className={kStyles.emptyBoardIcon} aria-hidden>
              <ChecklistIcon size={36} strokeWidth={1.4} />
            </div>
            <div className={kStyles.emptyBoardTitle}>This board is empty</div>
            <div className={kStyles.emptyBoardSub}>
              Piles are the columns where your cards live. Add your first one to get going.
            </div>
            {can("manage_piles") && (
              <button
                type="button"
                className={kStyles.emptyBoardBtn}
                onClick={() => setAddingPile(true)}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                Create the first pile
              </button>
            )}
          </div>
        )}
        {tasks.length > 0 && filterCount > 0 && visibleCount === 0 && (
          <div className={kStyles.emptyFilter}>
            <div className={kStyles.emptyFilterText}>
              No cards match the current filter.
            </div>
            <button
              type="button"
              className={kStyles.emptyFilterBtn}
              onClick={() =>
                setFilter({
                  query: "",
                  assigneeIds: new Set(),
                  labelIds: new Set(),
                  due: "any",
                  fields: new Map(),
                })
              }
            >
              Clear filters
            </button>
          </div>
        )}
        {view === "table" && piles.length > 0 ? (
          <BoardTable
            piles={piles}
            cardsByPile={visibleCardsByPile}
            columns={columns}
            caps={{
              editCard: can("edit_card"),
              createCard: can("create_card"),
              deleteCard: can("delete_card"),
              managePiles: can("manage_piles"),
              editBoard: can("edit_board"),
            }}
            drag={drag}
            hint={hint}
            onAddCard={onAddCard}
            onDeleteCard={onDeleteCard}
            onOpenCard={openCard}
            onRenameCard={onRenameCard}
            onSetCardDue={onSetCardDue}
            onRenamePile={onRenamePile}
            onDeletePile={onDeletePile}
            onCreatePile={onCreatePile}
            onCardDragStart={onCardDragStart}
            onCardDragEnd={onCardDragEnd}
            onCardDragOver={onCardDragOver}
            onPileDragOver={onPileDragOver}
            onPileDragLeave={onPileDragLeave}
            onPileDrop={onPileDrop}
            onMoveCardToPile={onMoveToPile}
            onSetFieldValue={onSetFieldValue}
            onCreateField={onCreateField}
            onRenameField={onRenameField}
            onDeleteField={onDeleteField}
            boardMembers={boardMembers}
            boardMembersLoading={boardMembersLoading}
            onLoadMembers={loadBoardMembers}
            onSetAssignees={onSetAssignees}
          />
        ) : (
          <div className={kStyles.scroller}>
            {view === "board" &&
              [...piles]
                .sort((a, b) => a.position - b.position)
                .map((pile, idx, arr) => (
                <PileColumn
                  key={pile.id}
                  pile={pile}
                  cards={visibleCardsByPile.get(pile.id) ?? []}
                  piles={piles}
                  columns={columns}
                  dragHint={hint?.pileId === pile.id ? hint : null}
                  isDropTarget={hint?.pileId === pile.id && drag !== null}
                  draggingCardId={drag?.cardId ?? null}
                  onAddCard={onAddCard}
                  onDeleteCard={onDeleteCard}
                  onOpenCard={openCard}
                  onRenamePile={onRenamePile}
                  onDeletePile={onDeletePile}
                  onCardDragStart={onCardDragStart}
                  onCardDragEnd={onCardDragEnd}
                  onCardDragOver={onCardDragOver}
                  onPileDragOver={onPileDragOver}
                  onPileDragLeave={onPileDragLeave}
                  onPileDrop={onPileDrop}
                  onMoveToPile={onMoveToPile}
                  boardMembers={boardMembers}
                  boardMembersLoading={boardMembersLoading}
                  onLoadMembers={loadBoardMembers}
                  onSetAssignees={onSetAssignees}
                  pileReordering={pileDragId !== null}
                  isPileDragging={pileDragId === pile.id}
                  showPileDropBefore={pileDropHint?.beforeId === pile.id}
                  showPileDropAfter={
                    pileDropHint != null &&
                    pileDropHint.beforeId === null &&
                    idx === arr.length - 1
                  }
                  isFirstPile={idx === 0}
                  isLastPile={idx === arr.length - 1}
                  onPileReorderStart={onPileReorderStart}
                  onPileReorderOver={onPileReorderOver}
                  onPileReorderDrop={onPileReorderDrop}
                  onPileReorderEnd={onPileReorderEnd}
                  onMovePile={movePile}
                  canManagePiles={can("manage_piles")}
                  canCreateCard={can("create_card")}
                  canDeleteCard={can("delete_card")}
                  canEditCard={can("edit_card")}
                />
              ))}
            {/* Pile management lives in the board view; the table groups
                by existing piles. In the empty-board case we still show
                the create-pile form here regardless of the chosen view. */}
            {can("manage_piles") &&
              (view === "board" || piles.length === 0) &&
              (addingPile ? (
                <AddPileForm onCancel={() => setAddingPile(false)} onCreate={onCreatePile} />
              ) : (
                view === "board" && (
                  <button
                    type="button"
                    className={`${kStyles.addPile} ${addPileDragOver ? kStyles.addPileDragOver : ""}`}
                    onClick={() => setAddingPile(true)}
                    onDragOver={(e) => {
                      if (!drag) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (!addPileDragOver) setAddPileDragOver(true);
                    }}
                    onDragLeave={(e) => {
                      if (!drag) return;
                      const related = e.relatedTarget as Node | null;
                      if (related && (e.currentTarget as Node).contains(related)) return;
                      setAddPileDragOver(false);
                    }}
                    onDrop={onDropOnAddPile}
                  >
                    <span className={kStyles.addPileMark}>＋</span>
                    {drag ? "Drop here to create a new pile" : "Add another pile"}
                  </button>
                )
              ))}
          </div>
        )}
      </div>

      {openCardId !== null && (
        <CardDrawer
          cardId={openCardId}
          workspaceId={workspaceId}
          workspaceLabels={labels}
          onWorkspaceLabelsChange={setLabels}
          onClose={closeCard}
          onCountsChange={(id, counts: CardCounts) =>
            setTasks((prev) =>
              prev.map((t) =>
                t.id === id
                  ? {
                      ...t,
                      itemsTotal: counts.itemsTotal,
                      itemsDone: counts.itemsDone,
                      attachments: counts.attachments,
                    }
                  : t,
              ),
            )
          }
          onTitleChange={(id, title) =>
            setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)))
          }
          onLabelsChange={(id, cardLabels) =>
            setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, labels: cardLabels } : t)))
          }
          onAssigneesChange={(id, assignees) =>
            setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, assignees } : t)))
          }
          onDueAtChange={(id, dueAt) =>
            setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, dueAt } : t)))
          }
          onDelete={(id) => setTasks((prev) => prev.filter((t) => t.id !== id))}
          boardColumns={columns}
          fields={tasks.find((t) => t.id === openCardId)?.fields ?? {}}
          editFields={can("edit_card")}
          canEdit={can("edit_card")}
          canDelete={can("delete_card")}
          onFieldChange={(columnId, value) =>
            openCardId != null && onSetFieldValue(openCardId, columnId, value)
          }
        />
      )}
    </>
  );
}

/* ------------------------------------------------------- */

function PileColumn({
  pile,
  cards,
  piles,
  columns,
  dragHint,
  isDropTarget,
  draggingCardId,
  onAddCard,
  onDeleteCard,
  onOpenCard,
  onRenamePile,
  onDeletePile,
  onCardDragStart,
  onCardDragEnd,
  onCardDragOver,
  onPileDragOver,
  onPileDragLeave,
  onPileDrop,
  onMoveToPile,
  boardMembers,
  boardMembersLoading,
  onLoadMembers,
  onSetAssignees,
  pileReordering,
  isPileDragging,
  showPileDropBefore,
  showPileDropAfter,
  isFirstPile,
  isLastPile,
  onPileReorderStart,
  onPileReorderOver,
  onPileReorderDrop,
  onPileReorderEnd,
  onMovePile,
  canManagePiles,
  canCreateCard,
  canDeleteCard,
  canEditCard,
}: {
  pile: Pile;
  cards: Task[];
  piles: Pile[];
  columns: BoardColumn[];
  dragHint: DropHint;
  isDropTarget: boolean;
  draggingCardId: number | null;
  onAddCard: (pileId: number, title: string) => Promise<void>;
  onDeleteCard: (id: number) => void;
  onOpenCard: (id: number) => void;
  onRenamePile: (id: number, title: string) => void;
  onDeletePile: (pile: Pile) => void;
  onCardDragStart: (e: DragEvent<HTMLElement>, card: Task) => void;
  onCardDragEnd: () => void;
  onCardDragOver: (e: DragEvent<HTMLElement>, pile: Pile, card: Task) => void;
  onPileDragOver: (e: DragEvent<HTMLElement>, pile: Pile) => void;
  onPileDragLeave: (e: DragEvent<HTMLElement>, pile: Pile) => void;
  onPileDrop: (e: DragEvent<HTMLElement>, pile: Pile) => void;
  onMoveToPile: (cardId: number, pileId: number) => void;
  boardMembers: AssignMember[] | null;
  boardMembersLoading: boolean;
  onLoadMembers: () => void;
  onSetAssignees: (cardId: number, assignees: CardAssignee[]) => void;
  pileReordering: boolean;
  isPileDragging: boolean;
  showPileDropBefore: boolean;
  showPileDropAfter: boolean;
  isFirstPile: boolean;
  isLastPile: boolean;
  onPileReorderStart: (e: DragEvent<HTMLElement>, pileId: number) => void;
  onPileReorderOver: (e: DragEvent<HTMLElement>, pile: Pile) => void;
  onPileReorderDrop: (e: DragEvent<HTMLElement>) => void;
  onPileReorderEnd: () => void;
  onMovePile: (pileId: number, dir: -1 | 1) => void;
  canManagePiles: boolean;
  canCreateCard: boolean;
  canDeleteCard: boolean;
  canEditCard: boolean;
}) {
  const [composer, setComposer] = useState("");
  const pileColor = colorForName(pile.color ?? "slate");

  const onComposerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!composer.trim()) return;
    await onAddCard(pile.id, composer);
    setComposer("");
  };

  return (
    <div
      className={`${kStyles.pile} ${isDropTarget ? kStyles.pileDragOver : ""} ${isPileDragging ? kStyles.pileGhost : ""} ${pileReordering ? kStyles.pileReorderActive : ""}`}
      onDragOver={(e) => onPileDragOver(e, pile)}
      onDragLeave={(e) => onPileDragLeave(e, pile)}
      onDrop={(e) => onPileDrop(e, pile)}
    >
      {showPileDropBefore && (
        <span className={`${kStyles.pileDropBar} ${kStyles.pileDropBarBefore}`} aria-hidden />
      )}
      {showPileDropAfter && (
        <span className={`${kStyles.pileDropBar} ${kStyles.pileDropBarAfter}`} aria-hidden />
      )}
      <div
        className={kStyles.pileHead}
        onDragOver={canManagePiles ? (e) => onPileReorderOver(e, pile) : undefined}
        onDrop={canManagePiles ? onPileReorderDrop : undefined}
      >
        {canManagePiles && (
          <span
            className={kStyles.pileGrip}
            draggable
            data-handle
            role="button"
            tabIndex={-1}
            title="Drag to reorder pile"
            aria-label="Drag to reorder pile"
            onDragStart={(e) => onPileReorderStart(e, pile.id)}
            onDragEnd={onPileReorderEnd}
          >
            ⠿
          </span>
        )}
        <span className={kStyles.pileDot} style={{ background: pileColor.hue }} />
        {canManagePiles ? (
          <input
            className={kStyles.pileTitle}
            defaultValue={pile.title}
            onChange={(e) => onRenamePile(pile.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label="Pile title"
            maxLength={60}
          />
        ) : (
          <span className={kStyles.pileTitle} style={{ cursor: "default" }}>
            {pile.title}
          </span>
        )}
        <span className={kStyles.pileCount}>{cards.length}</span>
        {canManagePiles && (
          <span className={kStyles.pileReorderBtns}>
            <button
              type="button"
              className={kStyles.pileMenu}
              aria-label="Move pile left"
              title="Move left"
              disabled={isFirstPile}
              onClick={() => onMovePile(pile.id, -1)}
            >
              ‹
            </button>
            <button
              type="button"
              className={kStyles.pileMenu}
              aria-label="Move pile right"
              title="Move right"
              disabled={isLastPile}
              onClick={() => onMovePile(pile.id, 1)}
            >
              ›
            </button>
          </span>
        )}
        {canManagePiles && (
          <button
            type="button"
            className={kStyles.pileMenu}
            aria-label="Delete pile"
            title="Delete pile"
            onClick={() => onDeletePile(pile)}
          >
            ×
          </button>
        )}
      </div>

      <div className={kStyles.pileBody}>
        {cards.length === 0 && dragHint === null && (
          <div className={kStyles.empty}>No cards yet</div>
        )}
        {cards.map((card) => (
          <Fragment key={card.id}>
            {dragHint && dragHint.beforeCardId === card.id && (
              <div className={kStyles.cardDropIndicator} aria-hidden />
            )}
            <KanbanCard
              card={card}
              piles={piles}
              columns={columns}
              dragging={draggingCardId === card.id}
              onDragStart={(e) => onCardDragStart(e, card)}
              onDragEnd={onCardDragEnd}
              onDragOver={(e) => onCardDragOver(e, pile, card)}
              onDelete={onDeleteCard}
              onOpen={onOpenCard}
              onMoveToPile={onMoveToPile}
              boardMembers={boardMembers}
              boardMembersLoading={boardMembersLoading}
              onLoadMembers={onLoadMembers}
              onSetAssignees={onSetAssignees}
              canDelete={canDeleteCard}
              canMove={canEditCard}
              canAssign={canEditCard}
            />
          </Fragment>
        ))}
        {dragHint && dragHint.beforeCardId === null && (
          <div className={kStyles.cardDropIndicator} aria-hidden />
        )}
      </div>

      {canCreateCard && (
        <form className={kStyles.pileComposer} onSubmit={onComposerSubmit}>
          <input
            className={kStyles.composerInput}
            placeholder="+ Add a card"
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            maxLength={255}
          />
          <div className={kStyles.composerHint}>Press enter to add</div>
        </form>
      )}
    </div>
  );
}

/** Compact display chips for a card's custom-field values (kanban). */
function fieldChipsFor(
  card: Task,
  columns: BoardColumn[],
): { key: string; label: string; color?: string }[] {
  const out: { key: string; label: string; color?: string }[] = [];
  const fields = card.fields ?? {};
  for (const col of [...columns].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    const v = fields[col.id];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    const name = col.label ?? "";
    const opts = col.config?.options ?? [];
    if (col.type === "select" && typeof v === "string") {
      const o = opts.find((x) => x.id === v);
      if (o) out.push({ key: `${col.id}`, label: o.label, color: o.color });
    } else if (col.type === "multi_select" && Array.isArray(v)) {
      for (const id of v) {
        const o = opts.find((x) => x.id === id);
        if (o) out.push({ key: `${col.id}:${id}`, label: o.label, color: o.color });
      }
    } else if (col.type === "checkbox") {
      if (v === true) out.push({ key: `${col.id}`, label: `✓ ${name}` });
    } else if (col.type === "date" && typeof v === "string") {
      out.push({ key: `${col.id}`, label: `${name}: ${v.slice(0, 10)}` });
    } else {
      out.push({ key: `${col.id}`, label: `${name}: ${String(v)}` });
    }
  }
  return out;
}

function KanbanCard({
  card,
  piles,
  columns,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDelete,
  onOpen,
  onMoveToPile,
  boardMembers,
  boardMembersLoading,
  onLoadMembers,
  onSetAssignees,
  canDelete,
  canMove,
  canAssign,
}: {
  card: Task;
  piles: Pile[];
  columns: BoardColumn[];
  dragging: boolean;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDelete: (id: number) => void;
  onOpen: (id: number) => void;
  onMoveToPile: (cardId: number, pileId: number) => void;
  boardMembers: AssignMember[] | null;
  boardMembersLoading: boolean;
  onLoadMembers: () => void;
  onSetAssignees: (cardId: number, assignees: CardAssignee[]) => void;
  canDelete: boolean;
  canMove: boolean;
  canAssign: boolean;
}) {
  const itemPct = card.itemsTotal === 0 ? 0 : Math.round((card.itemsDone / card.itemsTotal) * 100);
  const fieldChips = fieldChipsFor(card, columns);
  const onCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (card.id < 0) return;
    const target = e.target as HTMLElement;
    // Don't open the drawer when the click landed on something interactive
    // inside the card (title input, action buttons, label chips, etc.)
    if (target.closest("input, textarea, button, a, [contenteditable]")) return;
    onOpen(card.id);
  };

  return (
    <div
      className={`${kStyles.card} ${dragging ? kStyles.cardDragging : ""}`}
      draggable={card.id > 0}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onClick={onCardClick}
      role="button"
      tabIndex={card.id > 0 ? 0 : -1}
      onKeyDown={(e) => {
        if (card.id < 0) return;
        if (e.key === "Enter" || e.key === " ") {
          const target = e.target as HTMLElement;
          if (target.closest("input, textarea, button, a, [contenteditable]")) return;
          e.preventDefault();
          onOpen(card.id);
        }
      }}
    >
      {card.labels.length > 0 && (
        <div className={kStyles.cardChips}>
          {card.labels.map((l) => {
            const c = colorForName(l.color);
            return (
              <span
                key={l.id}
                className={kStyles.cardChip}
                style={{ background: c.soft, color: c.hue }}
                title={l.title}
              >
                <span className={kStyles.cardChipDot} style={{ background: c.hue }} aria-hidden />
                {l.title}
              </span>
            );
          })}
        </div>
      )}
      <div className={kStyles.cardTitle}>
        {card.title?.trim() ? card.title : <span className={kStyles.cardTitleMute}>Untitled</span>}
      </div>
      {fieldChips.length > 0 && (
        <div className={kStyles.cardChips}>
          {fieldChips.map((f) => {
            const c = f.color ? colorForName(f.color) : null;
            return (
              <span
                key={f.key}
                className={kStyles.cardChip}
                style={
                  c
                    ? { background: c.soft, color: c.hue }
                    : { background: "var(--surface-2)", color: "var(--text-2)" }
                }
                title={f.label}
              >
                {c && <span className={kStyles.cardChipDot} style={{ background: c.hue }} aria-hidden />}
                {f.label}
              </span>
            );
          })}
        </div>
      )}
      <div className={kStyles.cardFoot}>
        <div className={kStyles.cardBadges}>
          {card.dueAt && <DueBadge dueAt={card.dueAt} />}
          {card.itemsTotal > 0 && (
            <span
              className={kStyles.cardBadge}
              data-complete={card.itemsTotal === card.itemsDone}
              title={`${card.itemsDone}/${card.itemsTotal} sub-tasks`}
            >
              <ChecklistIcon size={11} />
              <span>
                {card.itemsDone}/{card.itemsTotal}
              </span>
              <span className={kStyles.cardMiniBar}>
                <span className={kStyles.cardMiniBarFill} style={{ width: `${itemPct}%` }} />
              </span>
            </span>
          )}
          {card.attachments > 0 && (
            <span className={kStyles.cardBadge} title={`${card.attachments} images`}>
              <PaperclipIcon size={11} />
              <span>{card.attachments}</span>
            </span>
          )}
          {card.comments > 0 && (
            <span className={kStyles.cardBadge} title={`${card.comments} comments`}>
              <CommentIcon size={11} />
              <span>{card.comments}</span>
            </span>
          )}
          {card.links > 0 && (
            <span className={kStyles.cardBadge} title={`${card.links} linked commit(s)/PR(s)`}>
              <LinkIcon size={11} />
              <span>{card.links}</span>
            </span>
          )}
          {canAssign && card.id > 0 ? (
            <AssignMenu
              members={boardMembers}
              loading={boardMembersLoading}
              assignedIds={new Set(card.assignees.map((a) => a.userId))}
              onOpen={onLoadMembers}
              onToggle={(m) => {
                const has = card.assignees.some((a) => a.userId === m.userId);
                const next = has
                  ? card.assignees.filter((a) => a.userId !== m.userId)
                  : [...card.assignees, m];
                onSetAssignees(card.id, next);
              }}
              triggerClassName={kStyles.assignTrigger}
              triggerLabel={
                card.assignees.length > 0 ? "Edit assignees" : "Assign people"
              }
            >
              {card.assignees.length > 0 ? (
                <AvatarStack assignees={card.assignees} />
              ) : (
                <span className={kStyles.assignEmpty} aria-hidden>
                  <UsersIcon size={12} />
                </span>
              )}
            </AssignMenu>
          ) : (
            card.assignees.length > 0 && <AvatarStack assignees={card.assignees} />
          )}
        </div>
        <div className={kStyles.cardActions}>
          {canMove && card.id > 0 && (
            <MovePileMenu
              piles={piles}
              currentPileId={card.pileId}
              onMove={(pileId) => onMoveToPile(card.id, pileId)}
            />
          )}
          <button
            type="button"
            className={kStyles.iconBtn}
            onClick={() => onOpen(card.id)}
            aria-label="Open card"
            title="Open card"
          >
            ›
          </button>
          {canDelete && (
            <button
              type="button"
              className={`${kStyles.iconBtn} ${kStyles.iconBtnDanger}`}
              onClick={() => onDelete(card.id)}
              aria-label="Delete card"
              title="Delete"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function dueState(dueAt: string | Date): "overdue" | "soon" | "later" {
  const t = typeof dueAt === "string" ? new Date(dueAt).getTime() : dueAt.getTime();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (t < now) return "overdue";
  if (t - now < 2 * dayMs) return "soon";
  return "later";
}

function formatDueShort(dueAt: string | Date): string {
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function DueBadge({ dueAt }: { dueAt: string | Date }) {
  const state = dueState(dueAt);
  return (
    <span
      className={kStyles.cardBadge}
      data-due={state}
      title={
        typeof dueAt === "string"
          ? new Date(dueAt).toLocaleString()
          : dueAt.toLocaleString()
      }
    >
      <CalendarIcon size={11} />
      <span>{formatDueShort(dueAt)}</span>
    </span>
  );
}

function initialsFor(a: CardAssignee): string {
  const f = a.firstname?.[0] ?? "";
  const l = a.lastname?.[0] ?? "";
  if (f || l) return (f + l).toUpperCase();
  return (a.email?.[0] ?? "?").toUpperCase();
}

function nameFor(a: CardAssignee): string {
  const n = [a.firstname, a.lastname].filter(Boolean).join(" ");
  return n || a.email || "Unknown";
}

function AvatarStack({ assignees }: { assignees: CardAssignee[] }) {
  const visible = assignees.slice(0, 3);
  const extra = assignees.length - visible.length;
  return (
    <span className={kStyles.avatarStack} title={assignees.map(nameFor).join(", ")}>
      {visible.map((a) => (
        <span key={a.userId} className={kStyles.avatarPip}>
          {initialsFor(a)}
        </span>
      ))}
      {extra > 0 && <span className={`${kStyles.avatarPip} ${kStyles.avatarPipMore}`}>+{extra}</span>}
    </span>
  );
}

function BoardActionsMenu({
  boardId,
  workspaceId,
  canManageMembers,
}: {
  boardId: number;
  workspaceId: number;
  canManageMembers: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: {
    href: string;
    label: string;
    sub: string;
    icon: ReactNode;
    show: boolean;
  }[] = [
    {
      href: `/boards/${boardId}/settings`,
      label: "Board settings",
      sub: "Rename or delete this board",
      icon: <SettingsIcon size={16} />,
      show: true,
    },
    {
      href: `/boards/${boardId}/fields`,
      label: "Custom fields",
      sub: "Add and configure card fields",
      icon: <TableIcon size={16} />,
      show: true,
    },
    {
      href: `/boards/${boardId}/members`,
      label: "Members",
      sub: "Who can see this board",
      icon: <UsersIcon size={16} />,
      show: true,
    },
    {
      href: `/workspaces/${workspaceId}/integrations`,
      label: "Integrations",
      sub: "Connect Gitea & more",
      icon: <PlugIcon size={16} />,
      show: canManageMembers,
    },
  ];

  return (
    <div className={kStyles.filterWrap} ref={wrapRef}>
      <button
        type="button"
        className={kStyles.filterBtn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <SettingsIcon size={14} />
        <span>Manage</span>
      </button>
      {open && (
        <div className={kStyles.actionsMenu} role="menu">
          {items
            .filter((it) => it.show)
            .map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={kStyles.actionItem}
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span className={kStyles.actionIcon}>{it.icon}</span>
                <span className={kStyles.actionText}>
                  <span className={kStyles.actionLabel}>{it.label}</span>
                  <span className={kStyles.actionSub}>{it.sub}</span>
                </span>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}

function BoardFilter({
  filter,
  setFilter,
  allAssignees,
  allLabels,
  columns,
  currentUserId,
}: {
  filter: BoardFilterState;
  setFilter: (next: BoardFilterState) => void;
  allAssignees: CardAssignee[];
  allLabels: WorkspaceLabel[];
  columns: BoardColumn[];
  currentUserId: number;
}) {
  // Only select / multi_select fields with options are filterable.
  const filterableFields = columns.filter(
    (c) =>
      (c.type === "select" || c.type === "multi_select") &&
      (c.config?.options?.length ?? 0) > 0,
  );
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count =
    (filter.query.trim() ? 1 : 0) +
    filter.assigneeIds.size +
    filter.labelIds.size +
    (filter.due === "any" ? 0 : 1) +
    fieldFilterCount(filter.fields);

  const toggleAssignee = (uid: number) => {
    const next = new Set(filter.assigneeIds);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    setFilter({ ...filter, assigneeIds: next });
  };
  const toggleLabel = (lid: number) => {
    const next = new Set(filter.labelIds);
    if (next.has(lid)) next.delete(lid);
    else next.add(lid);
    setFilter({ ...filter, labelIds: next });
  };
  const toggleFieldOption = (colId: number, optId: string) => {
    const fields = new Map(filter.fields);
    const next = new Set(fields.get(colId));
    if (next.has(optId)) next.delete(optId);
    else next.add(optId);
    if (next.size === 0) fields.delete(colId);
    else fields.set(colId, next);
    setFilter({ ...filter, fields });
  };
  const clearField = (colId: number) => {
    const fields = new Map(filter.fields);
    fields.delete(colId);
    setFilter({ ...filter, fields });
  };
  const reset = () =>
    setFilter({
      query: "",
      assigneeIds: new Set(),
      labelIds: new Set(),
      due: "any",
      fields: new Map(),
    });

  return (
    <div className={kStyles.filterWrap} ref={wrapRef}>
      <button
        type="button"
        className={`${kStyles.filterBtn} ${count > 0 ? kStyles.filterBtnActive : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={count > 0 ? `Filters (${count} active)` : "Filters"}
      >
        <FilterIcon size={14} />
        <span>Filter{count > 0 ? ` · ${count}` : ""}</span>
      </button>
      {open && (
        <div className={kStyles.filterMenu} role="dialog">
          <div className={kStyles.filterSection}>
            <div className={kStyles.filterHead}>
              <span>Search</span>
              {filter.query && (
                <button
                  type="button"
                  className={kStyles.filterClear}
                  onClick={() => setFilter({ ...filter, query: "" })}
                >
                  Clear
                </button>
              )}
            </div>
            <input
              type="search"
              className={kStyles.filterSearch}
              placeholder="Filter by card title…"
              value={filter.query}
              onChange={(e) => setFilter({ ...filter, query: e.target.value })}
              autoFocus
            />
          </div>

          <div className={kStyles.filterSection}>
            <div className={kStyles.filterHead}>
              <span>Assignees</span>
              {filter.assigneeIds.size > 0 && (
                <button
                  type="button"
                  className={kStyles.filterClear}
                  onClick={() => setFilter({ ...filter, assigneeIds: new Set() })}
                >
                  Clear
                </button>
              )}
            </div>
            {allAssignees.length === 0 ? (
              <div className={kStyles.filterEmpty}>No assignees on this board yet.</div>
            ) : (
              <div className={kStyles.filterChips}>
                {allAssignees.some((a) => a.userId === currentUserId) && (
                  <button
                    type="button"
                    className={`${kStyles.filterChip} ${
                      filter.assigneeIds.has(currentUserId) ? kStyles.filterChipActive : ""
                    }`}
                    onClick={() => toggleAssignee(currentUserId)}
                  >
                    Me
                  </button>
                )}
                {allAssignees
                  .filter((a) => a.userId !== currentUserId)
                  .map((a) => (
                    <button
                      key={a.userId}
                      type="button"
                      className={`${kStyles.filterChip} ${
                        filter.assigneeIds.has(a.userId) ? kStyles.filterChipActive : ""
                      }`}
                      onClick={() => toggleAssignee(a.userId)}
                    >
                      {nameFor(a)}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className={kStyles.filterSection}>
            <div className={kStyles.filterHead}>
              <span>Labels</span>
              {filter.labelIds.size > 0 && (
                <button
                  type="button"
                  className={kStyles.filterClear}
                  onClick={() => setFilter({ ...filter, labelIds: new Set() })}
                >
                  Clear
                </button>
              )}
            </div>
            {allLabels.length === 0 ? (
              <div className={kStyles.filterEmpty}>No labels in this workspace.</div>
            ) : (
              <div className={kStyles.filterChips}>
                {allLabels.map((l) => {
                  const c = colorForName(l.color);
                  const active = filter.labelIds.has(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className={`${kStyles.filterChip} ${active ? kStyles.filterChipActive : ""}`}
                      style={active ? { background: c.soft, color: c.hue, borderColor: c.soft } : undefined}
                      onClick={() => toggleLabel(l.id)}
                    >
                      <span
                        className={kStyles.cardChipDot}
                        style={{ background: c.hue, marginRight: 6 }}
                        aria-hidden
                      />
                      {l.title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {filterableFields.map((col) => {
            const selected = filter.fields.get(col.id) ?? new Set<string>();
            return (
              <div className={kStyles.filterSection} key={col.id}>
                <div className={kStyles.filterHead}>
                  <span>{col.label || "Field"}</span>
                  {selected.size > 0 && (
                    <button
                      type="button"
                      className={kStyles.filterClear}
                      onClick={() => clearField(col.id)}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className={kStyles.filterChips}>
                  {(col.config?.options ?? []).map((opt) => {
                    const active = selected.has(opt.id);
                    const c = opt.color ? colorForName(opt.color) : null;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`${kStyles.filterChip} ${active ? kStyles.filterChipActive : ""}`}
                        style={
                          active && c
                            ? { background: c.soft, color: c.hue, borderColor: c.soft }
                            : undefined
                        }
                        onClick={() => toggleFieldOption(col.id, opt.id)}
                      >
                        {c && (
                          <span
                            className={kStyles.cardChipDot}
                            style={{ background: c.hue, marginRight: 6 }}
                            aria-hidden
                          />
                        )}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className={kStyles.filterSection}>
            <div className={kStyles.filterHead}>
              <span>Due date</span>
            </div>
            <div className={kStyles.filterChips}>
              {(["any", "withDue", "overdue"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`${kStyles.filterChip} ${
                    filter.due === opt ? kStyles.filterChipActive : ""
                  }`}
                  onClick={() => setFilter({ ...filter, due: opt })}
                >
                  {opt === "any" ? "Any" : opt === "withDue" ? "Has a due date" : "Overdue"}
                </button>
              ))}
            </div>
          </div>

          {count > 0 && (
            <div className={kStyles.filterFoot}>
              <button type="button" className={kStyles.filterReset} onClick={reset}>
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddPileForm({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  return (
    <form
      className={kStyles.addPileFormWrap}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        await onCreate(title);
        setTitle("");
      }}
    >
      <input
        className={kStyles.addPileInput}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Pile name"
        autoFocus
        maxLength={60}
      />
      <div className={kStyles.addPileActions}>
        <button type="button" className={kStyles.btnGhost} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={kStyles.btnPrimary} disabled={!title.trim()}>
          Create
        </button>
      </div>
    </form>
  );
}
