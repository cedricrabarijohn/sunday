"use client";

import {
  CSSProperties,
  DragEvent,
  FormEvent,
  Fragment,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { colorForName } from "@/lib/palette";
import CardDrawer, { CardCounts } from "@/components/organisms/card-drawer/CardDrawer";
import styles from "../../workspaces/AppShell.module.scss";
import kStyles from "./Kanban.module.scss";

type CardLabel = { id: number; title: string; color: string };

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
  labels: CardLabel[];
};

type Pile = {
  id: number;
  title: string;
  color: string | null;
  position: number;
};

type DragState = { cardId: number; fromPileId: number | null } | null;
type DropHint = { pileId: number; beforeCardId: number | null } | null;

export default function TasksClient({
  boardId,
  boardTitle,
  workspaceId,
  workspaceTitle,
  initial,
  initialPiles,
  initialLabels,
}: {
  boardId: number;
  boardTitle: string | null;
  workspaceId: number;
  workspaceTitle: string | null;
  initial: Task[];
  initialPiles: Pile[];
  initialLabels: WorkspaceLabel[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [piles, setPiles] = useState<Pile[]>(initialPiles);
  const [labels, setLabels] = useState<WorkspaceLabel[]>(initialLabels);
  const [error, setError] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const [addingPile, setAddingPile] = useState(false);
  const [addPileDragOver, setAddPileDragOver] = useState(false);

  const renameTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pileRenameTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

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

  // --- card rename
  const onRename = useCallback((id: number, title: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
    if (id < 0) return;
    const existing = renameTimers.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Could not save change");
        }
      } catch {
        setError("Network error. Change not saved.");
      }
    }, 400);
    renameTimers.current.set(id, timer);
  }, []);

  // --- card add (per pile)
  const onAddCard = async (pileId: number, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);

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
        labels: [],
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
        setError(data.error || "Could not add card");
        return;
      }
      setTasks((prev) =>
        prev.map((t) =>
          t.id === tempId
            ? {
                ...t,
                id: data.task.id,
                title: data.task.title,
                position: data.task.position,
                pileId: data.task.pileId,
              }
            : t,
        ),
      );
    } catch {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
      setError("Network error. Please try again.");
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
        setError("Could not delete card");
      }
    } catch {
      setTasks(snapshot);
      setError("Network error.");
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
        setError(data.error || "Could not move card");
      }
    } catch {
      setTasks(snapshot);
      setError("Network error.");
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
        setError(pileData.error || "Could not create pile");
        return;
      }
      const realPileId = pileData.pile.id as number;

      // Swap the temp pile id for the real one in both states
      setPiles((prev) =>
        prev.map((p) =>
          p.id === tempPileId
            ? { id: realPileId, title: pileData.pile.title, color: pileData.pile.color, position: pileData.pile.position }
            : p,
        ),
      );
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
        setError(data.error || "Card move failed");
      }
    } catch {
      setPiles(pilesSnapshot);
      setTasks(tasksSnapshot);
      setError("Network error.");
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
        setError(data.error || "Could not create pile");
        return;
      }
      setPiles((prev) =>
        prev.map((p) =>
          p.id === tempId
            ? { id: data.pile.id, title: data.pile.title, color: data.pile.color, position: data.pile.position }
            : p,
        ),
      );
    } catch {
      setPiles((prev) => prev.filter((p) => p.id !== tempId));
      setError("Network error.");
    }
  };

  // --- pile rename (debounced)
  const onRenamePile = (pileId: number, title: string) => {
    setPiles((prev) => prev.map((p) => (p.id === pileId ? { ...p, title } : p)));
    if (pileId < 0) return;
    const existing = pileRenameTimers.current.get(pileId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/piles/${pileId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Could not rename pile");
        }
      } catch {
        setError("Network error.");
      }
    }, 400);
    pileRenameTimers.current.set(pileId, timer);
  };

  // --- pile delete
  const onDeletePile = async (pile: Pile) => {
    const cards = cardsByPile.get(pile.id) ?? [];
    if (cards.length > 0) {
      setError("Move the cards out of this pile before deleting it.");
      return;
    }
    if (!confirm(`Delete pile "${pile.title}"?`)) return;
    const snapshot = piles;
    setPiles((prev) => prev.filter((p) => p.id !== pile.id));
    try {
      const res = await fetch(`/api/piles/${pile.id}`, { method: "DELETE" });
      if (!res.ok) {
        setPiles(snapshot);
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not delete pile");
      }
    } catch {
      setPiles(snapshot);
      setError("Network error.");
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
            {(boardTitle?.[0] || "B").toUpperCase()}
          </span>
          <div>
            <h1 className={styles.pageTitle}>{boardTitle || "Untitled board"}</h1>
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
        <span className={styles.pageMeta}>
          {piles.length} {piles.length === 1 ? "pile" : "piles"} ·{" "}
          {tasks.length} {tasks.length === 1 ? "card" : "cards"}
        </span>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={kStyles.board}>
        <div className={kStyles.scroller}>
          {piles.map((pile) => (
            <PileColumn
              key={pile.id}
              pile={pile}
              cards={cardsByPile.get(pile.id) ?? []}
              dragHint={hint?.pileId === pile.id ? hint : null}
              isDropTarget={hint?.pileId === pile.id && drag !== null}
              draggingCardId={drag?.cardId ?? null}
              onAddCard={onAddCard}
              onDeleteCard={onDeleteCard}
              onRenameCard={onRename}
              onOpenCard={(id) => id > 0 && setOpenCardId(id)}
              onRenamePile={onRenamePile}
              onDeletePile={onDeletePile}
              onCardDragStart={onCardDragStart}
              onCardDragEnd={onCardDragEnd}
              onCardDragOver={onCardDragOver}
              onPileDragOver={onPileDragOver}
              onPileDragLeave={onPileDragLeave}
              onPileDrop={onPileDrop}
            />
          ))}
          {addingPile ? (
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
          )}
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
  onRenameCard,
  onOpenCard,
  onRenamePile,
  onDeletePile,
  onCardDragStart,
  onCardDragEnd,
  onCardDragOver,
  onPileDragOver,
  onPileDragLeave,
  onPileDrop,
}: {
  pile: Pile;
  cards: Task[];
  dragHint: DropHint;
  isDropTarget: boolean;
  draggingCardId: number | null;
  onAddCard: (pileId: number, title: string) => Promise<void>;
  onDeleteCard: (id: number) => void;
  onRenameCard: (id: number, title: string) => void;
  onOpenCard: (id: number) => void;
  onRenamePile: (id: number, title: string) => void;
  onDeletePile: (pile: Pile) => void;
  onCardDragStart: (e: DragEvent<HTMLDivElement>, card: Task) => void;
  onCardDragEnd: () => void;
  onCardDragOver: (e: DragEvent<HTMLDivElement>, pile: Pile, card: Task) => void;
  onPileDragOver: (e: DragEvent<HTMLDivElement>, pile: Pile) => void;
  onPileDragLeave: (e: DragEvent<HTMLDivElement>, pile: Pile) => void;
  onPileDrop: (e: DragEvent<HTMLDivElement>, pile: Pile) => void;
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
        <span className={kStyles.pileCount}>{cards.length}</span>
        <button
          type="button"
          className={kStyles.pileMenu}
          aria-label="Delete pile"
          title="Delete pile"
          onClick={() => onDeletePile(pile)}
        >
          ×
        </button>
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
              onRename={onRenameCard}
              onDelete={onDeleteCard}
              onOpen={onOpenCard}
            />
          </Fragment>
        ))}
        {dragHint && dragHint.beforeCardId === null && (
          <div className={kStyles.cardDropIndicator} aria-hidden />
        )}
      </div>

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
    </div>
  );
}

function KanbanCard({
  card,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onRename,
  onDelete,
  onOpen,
}: {
  card: Task;
  dragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
  onOpen: (id: number) => void;
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
      <input
        className={kStyles.cardTitle}
        defaultValue={card.title || ""}
        onChange={(e) => onRename(card.id, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onDragStart={(e) => e.preventDefault()}
        placeholder="Untitled"
      />
      <div className={kStyles.cardFoot}>
        <div className={kStyles.cardBadges}>
          {card.itemsTotal > 0 && (
            <span
              className={kStyles.cardBadge}
              data-complete={card.itemsTotal === card.itemsDone}
              title={`${card.itemsDone}/${card.itemsTotal} sub-tasks`}
            >
              <span className={kStyles.cardBadgeIcon} aria-hidden>✓</span>
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
              <span className={kStyles.cardBadgeIcon} aria-hidden>▣</span>
              <span>{card.attachments}</span>
            </span>
          )}
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
          <button
            type="button"
            className={`${kStyles.iconBtn} ${kStyles.iconBtnDanger}`}
            onClick={() => onDelete(card.id)}
            aria-label="Delete card"
            title="Delete"
          >
            ×
          </button>
        </div>
      </div>
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
