"use client";

import {
  CSSProperties,
  DragEvent,
  FormEvent,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { colorForName } from "@/lib/palette";
import { useConfirm } from "@/components/organisms/confirm-dialog/ConfirmDialog";
import CardDrawer, { CardCounts } from "@/components/organisms/card-drawer/CardDrawer";
import type { BoardEvent } from "@/lib/board-bus";
import {
  CalendarIcon,
  ChecklistIcon,
  CommentIcon,
  FilterIcon,
  PaperclipIcon,
  SettingsIcon,
  UsersIcon,
} from "@/components/Icons";
import styles from "../../workspaces/AppShell.module.scss";
import kStyles from "./Kanban.module.scss";
import { useToast } from "@/components/organisms/toast/ToastProvider";

type CardLabel = { id: number; title: string; color: string };
type CardAssignee = {
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

type Task = {
  id: number;
  title: string | null;
  pileId: number | null;
  position: number | null;
  itemsTotal: number;
  itemsDone: number;
  attachments: number;
  comments: number;
  labels: CardLabel[];
  assignees: CardAssignee[];
  dueAt: string | Date | null;
};

type Pile = {
  id: number;
  title: string;
  color: string | null;
  position: number;
};

type DragState = { cardId: number; fromPileId: number | null } | null;
type DropHint = { pileId: number; beforeCardId: number | null } | null;

type BoardFilterState = {
  query: string;
  assigneeIds: Set<number>;
  labelIds: Set<number>;
  due: "any" | "withDue" | "overdue";
};

export default function TasksClient({
  boardId,
  boardTitle,
  workspaceId,
  workspaceTitle,
  initial,
  initialPiles,
  initialLabels,
  capabilities,
  currentUserId,
}: {
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
  initial: Task[];
  initialPiles: Pile[];
  initialLabels: WorkspaceLabel[];
  capabilities: string[];
  currentUserId: number;
}) {
  const caps = new Set(capabilities);
  const can = (c: string) => caps.has(c);
  const router = useRouter();
  const { confirm } = useConfirm();
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [piles, setPiles] = useState<Pile[]>(initialPiles);
  const [labels, setLabels] = useState<WorkspaceLabel[]>(initialLabels);
  const [title, setTitle] = useState<string>(boardTitle || "");
  const [openCardId, setOpenCardId] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const [addingPile, setAddingPile] = useState(false);
  const [addPileDragOver, setAddPileDragOver] = useState(false);

  const pileRenameTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const titleRenameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  });

  const queryNorm = filter.query.trim().toLowerCase();
  const filterCount =
    (queryNorm ? 1 : 0) +
    filter.assigneeIds.size +
    filter.labelIds.size +
    (filter.due === "any" ? 0 : 1);

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

  // --- drag & drop
  const onCardDragStart = (e: DragEvent<HTMLDivElement>, card: Task) => {
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

  const onCardDragOver = (e: DragEvent<HTMLDivElement>, pile: Pile, card: Task) => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    if (drag.cardId === card.id) return;
    setHint({ pileId: pile.id, beforeCardId: card.id });
  };

  const onPileDragOver = (e: DragEvent<HTMLDivElement>, pile: Pile) => {
    if (!drag) return;
    e.preventDefault();
    setHint((prev) => {
      if (prev && prev.pileId === pile.id) return prev;
      return { pileId: pile.id, beforeCardId: null };
    });
  };

  const onPileDragLeave = (e: DragEvent<HTMLDivElement>, pile: Pile) => {
    if (!drag) return;
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
    setHint((prev) => (prev && prev.pileId === pile.id ? null : prev));
  };

  const onPileDrop = async (e: DragEvent<HTMLDivElement>, pile: Pile) => {
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
  ) => {
    const snapshot = tasks;
    const moved = snapshot.find((t) => t.id === cardId);
    if (!moved) return;

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
      }
    } catch {
      setTasks(snapshot);
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
          <BoardFilter
            filter={filter}
            setFilter={setFilter}
            allAssignees={allAssigneesOnBoard}
            allLabels={labels}
            currentUserId={currentUserId}
          />
          <Link
            href={`/boards/${boardId}/members`}
            className={styles.iconHeaderBtn}
            title="Members"
            aria-label="Members"
          >
            <UsersIcon size={16} />
          </Link>
          <Link
            href={`/boards/${boardId}/settings`}
            className={styles.iconHeaderBtn}
            title="Board settings"
            aria-label="Board settings"
          >
            <SettingsIcon size={16} />
          </Link>
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
                })
              }
            >
              Clear filters
            </button>
          </div>
        )}
        <div className={kStyles.scroller}>
          {piles.map((pile) => (
            <PileColumn
              key={pile.id}
              pile={pile}
              cards={visibleCardsByPile.get(pile.id) ?? []}
              dragHint={hint?.pileId === pile.id ? hint : null}
              isDropTarget={hint?.pileId === pile.id && drag !== null}
              draggingCardId={drag?.cardId ?? null}
              onAddCard={onAddCard}
              onDeleteCard={onDeleteCard}
              onOpenCard={(id) => id > 0 && setOpenCardId(id)}
              onRenamePile={onRenamePile}
              onDeletePile={onDeletePile}
              onCardDragStart={onCardDragStart}
              onCardDragEnd={onCardDragEnd}
              onCardDragOver={onCardDragOver}
              onPileDragOver={onPileDragOver}
              onPileDragLeave={onPileDragLeave}
              onPileDrop={onPileDrop}
              canManagePiles={can("manage_piles")}
              canCreateCard={can("create_card")}
              canDeleteCard={can("delete_card")}
            />
          ))}
          {can("manage_piles") &&
            (addingPile ? (
              <AddPileForm onCancel={() => setAddingPile(false)} onCreate={onCreatePile} />
            ) : (
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
            ))}
        </div>
      </div>

      {openCardId !== null && (
        <CardDrawer
          cardId={openCardId}
          workspaceId={workspaceId}
          workspaceLabels={labels}
          onWorkspaceLabelsChange={setLabels}
          onClose={() => setOpenCardId(null)}
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
        />
      )}
    </>
  );
}

/* ------------------------------------------------------- */

function PileColumn({
  pile,
  cards,
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
  canManagePiles,
  canCreateCard,
  canDeleteCard,
}: {
  pile: Pile;
  cards: Task[];
  dragHint: DropHint;
  isDropTarget: boolean;
  draggingCardId: number | null;
  onAddCard: (pileId: number, title: string) => Promise<void>;
  onDeleteCard: (id: number) => void;
  onOpenCard: (id: number) => void;
  onRenamePile: (id: number, title: string) => void;
  onDeletePile: (pile: Pile) => void;
  onCardDragStart: (e: DragEvent<HTMLDivElement>, card: Task) => void;
  onCardDragEnd: () => void;
  onCardDragOver: (e: DragEvent<HTMLDivElement>, pile: Pile, card: Task) => void;
  onPileDragOver: (e: DragEvent<HTMLDivElement>, pile: Pile) => void;
  onPileDragLeave: (e: DragEvent<HTMLDivElement>, pile: Pile) => void;
  onPileDrop: (e: DragEvent<HTMLDivElement>, pile: Pile) => void;
  canManagePiles: boolean;
  canCreateCard: boolean;
  canDeleteCard: boolean;
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
      className={`${kStyles.pile} ${isDropTarget ? kStyles.pileDragOver : ""}`}
      onDragOver={(e) => onPileDragOver(e, pile)}
      onDragLeave={(e) => onPileDragLeave(e, pile)}
      onDrop={(e) => onPileDrop(e, pile)}
    >
      <div className={kStyles.pileHead}>
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
              dragging={draggingCardId === card.id}
              onDragStart={(e) => onCardDragStart(e, card)}
              onDragEnd={onCardDragEnd}
              onDragOver={(e) => onCardDragOver(e, pile, card)}
              onDelete={onDeleteCard}
              onOpen={onOpenCard}
              canDelete={canDeleteCard}
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

function KanbanCard({
  card,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDelete,
  onOpen,
  canDelete,
}: {
  card: Task;
  dragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDelete: (id: number) => void;
  onOpen: (id: number) => void;
  canDelete: boolean;
}) {
  const itemPct = card.itemsTotal === 0 ? 0 : Math.round((card.itemsDone / card.itemsTotal) * 100);
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
          {card.assignees.length > 0 && <AvatarStack assignees={card.assignees} />}
        </div>
        <div className={kStyles.cardActions}>
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

function BoardFilter({
  filter,
  setFilter,
  allAssignees,
  allLabels,
  currentUserId,
}: {
  filter: BoardFilterState;
  setFilter: (next: BoardFilterState) => void;
  allAssignees: CardAssignee[];
  allLabels: WorkspaceLabel[];
  currentUserId: number;
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

  const count =
    (filter.query.trim() ? 1 : 0) +
    filter.assigneeIds.size +
    filter.labelIds.size +
    (filter.due === "any" ? 0 : 1);

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
  const reset = () =>
    setFilter({ query: "", assigneeIds: new Set(), labelIds: new Set(), due: "any" });

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
