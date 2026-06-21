"use client";

import { DragEvent } from "react";
import {
  ChecklistIcon,
  CommentIcon,
  LinkIcon,
  PaperclipIcon,
  UsersIcon,
} from "@/components/Icons";
import { colorForName } from "@/lib/palette";
import kStyles from "./Kanban.module.scss";
import MovePileMenu from "./MovePileMenu";
import AssignMenu, { AssignMember } from "./AssignMenu";
import type { BoardColumn, CardAssignee, Pile, Task } from "@/lib/board-types";
import { AvatarStack } from "./avatar-stack";
import { DueBadge } from "./due-badge";

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

export function KanbanCard({
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
