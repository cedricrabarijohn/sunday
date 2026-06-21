"use client";

import { DragEvent, FormEvent, Fragment, useState } from "react";
import { colorForName } from "@/lib/palette";
import kStyles from "./Kanban.module.scss";
import { KanbanCard } from "./KanbanCard";
import type { AssignMember } from "./AssignMenu";
import type {
  BoardColumn,
  CardAssignee,
  DropHint,
  Pile,
  Task,
} from "@/lib/board-types";

export function PileColumn({
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
  onAddCard: (pileId: number, title: string) => Promise<boolean>;
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
    const title = composer.trim();
    if (!title) return;
    // Clear right away so the optimistic card isn't shadowed by leftover input
    // text while the request is in flight; restore it only if the add failed.
    setComposer("");
    const ok = await onAddCard(pile.id, title);
    if (!ok) setComposer(title);
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
