"use client";

import { FormEvent, useState } from "react";
import { colorForName } from "@/lib/palette";
import {
  CalendarIcon,
  CommentIcon,
  PaperclipIcon,
  ChecklistIcon,
} from "@/components/Icons";
import type { Task, Pile, CardAssignee } from "./TasksClient";
import styles from "./Table.module.scss";

type Caps = { editCard: boolean; createCard: boolean; deleteCard: boolean };

export default function BoardTable({
  piles,
  cardsByPile,
  caps,
  onAddCard,
  onDeleteCard,
  onOpenCard,
  onRenameCard,
  onSetCardDue,
}: {
  piles: Pile[];
  cardsByPile: Map<number, Task[]>;
  caps: Caps;
  onAddCard: (pileId: number, title: string) => Promise<void>;
  onDeleteCard: (id: number) => void;
  onOpenCard: (id: number) => void;
  onRenameCard: (id: number, title: string) => void;
  onSetCardDue: (id: number, dueAt: string | null) => void;
}) {
  return (
    <div className={styles.tableWrap}>
      {piles.map((pile) => {
        const cards = cardsByPile.get(pile.id) ?? [];
        const c = colorForName(pile.color ?? "slate");
        return (
          <section key={pile.id} className={styles.group}>
            <div className={styles.groupHead}>
              <span className={styles.groupDot} style={{ background: c.hue }} />
              <span className={styles.groupTitle}>{pile.title}</span>
              <span className={styles.groupCount}>{cards.length}</span>
            </div>

            <div className={styles.tableScroller}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.colTitle}>Card</th>
                    <th className={styles.colPeople}>Assignees</th>
                    <th className={styles.colDue}>Due</th>
                    <th className={styles.colLabels}>Labels</th>
                    <th className={styles.colMeta}>Activity</th>
                    <th className={styles.colActions} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {cards.length === 0 && (
                    <tr className={styles.emptyRow}>
                      <td colSpan={6}>No cards in this pile yet</td>
                    </tr>
                  )}
                  {cards.map((card) => (
                    <Row
                      key={card.id}
                      card={card}
                      caps={caps}
                      onDeleteCard={onDeleteCard}
                      onOpenCard={onOpenCard}
                      onRenameCard={onRenameCard}
                      onSetCardDue={onSetCardDue}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {caps.createCard && (
              <AddRow pileId={pile.id} onAddCard={onAddCard} />
            )}
          </section>
        );
      })}
    </div>
  );
}

function Row({
  card,
  caps,
  onDeleteCard,
  onOpenCard,
  onRenameCard,
  onSetCardDue,
}: {
  card: Task;
  caps: Caps;
  onDeleteCard: (id: number) => void;
  onOpenCard: (id: number) => void;
  onRenameCard: (id: number, title: string) => void;
  onSetCardDue: (id: number, dueAt: string | null) => void;
}) {
  const open = () => card.id > 0 && onOpenCard(card.id);
  const itemPct =
    card.itemsTotal === 0 ? 0 : Math.round((card.itemsDone / card.itemsTotal) * 100);

  return (
    <tr className={styles.row}>
      <td className={styles.colTitle}>
        {caps.editCard ? (
          <input
            className={styles.titleInput}
            defaultValue={card.title ?? ""}
            placeholder="Untitled"
            maxLength={255}
            onChange={(e) => onRenameCard(card.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <button type="button" className={styles.titleText} onClick={open}>
            {card.title?.trim() ? card.title : <span className={styles.mute}>Untitled</span>}
          </button>
        )}
      </td>

      <td className={styles.colPeople}>
        <button type="button" className={styles.cellBtn} onClick={open}>
          {card.assignees.length > 0 ? (
            <AvatarStack assignees={card.assignees} />
          ) : (
            <span className={styles.mute}>—</span>
          )}
        </button>
      </td>

      <td className={styles.colDue}>
        {caps.editCard ? (
          <DueCell card={card} onSetCardDue={onSetCardDue} />
        ) : card.dueAt ? (
          <DueBadge dueAt={card.dueAt} />
        ) : (
          <span className={styles.mute}>—</span>
        )}
      </td>

      <td className={styles.colLabels}>
        <button type="button" className={styles.cellBtn} onClick={open}>
          {card.labels.length > 0 ? (
            <span className={styles.chips}>
              {card.labels.map((l) => {
                const c = colorForName(l.color);
                return (
                  <span
                    key={l.id}
                    className={styles.chip}
                    style={{ background: c.soft, color: c.hue }}
                    title={l.title}
                  >
                    <span className={styles.chipDot} style={{ background: c.hue }} />
                    {l.title}
                  </span>
                );
              })}
            </span>
          ) : (
            <span className={styles.mute}>—</span>
          )}
        </button>
      </td>

      <td className={styles.colMeta}>
        <button type="button" className={styles.metaBtn} onClick={open} title="Open card">
          {card.itemsTotal > 0 && (
            <span className={styles.metaItem} data-complete={card.itemsDone === card.itemsTotal}>
              <ChecklistIcon size={12} />
              {card.itemsDone}/{card.itemsTotal}
              <span className={styles.miniBar}>
                <span className={styles.miniBarFill} style={{ width: `${itemPct}%` }} />
              </span>
            </span>
          )}
          {card.comments > 0 && (
            <span className={styles.metaItem}>
              <CommentIcon size={12} />
              {card.comments}
            </span>
          )}
          {card.attachments > 0 && (
            <span className={styles.metaItem}>
              <PaperclipIcon size={12} />
              {card.attachments}
            </span>
          )}
          {card.itemsTotal === 0 && card.comments === 0 && card.attachments === 0 && (
            <span className={styles.mute}>—</span>
          )}
        </button>
      </td>

      <td className={styles.colActions}>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={open}
            aria-label="Open card"
            title="Open card"
          >
            ›
          </button>
          {caps.deleteCard && (
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
              onClick={() => onDeleteCard(card.id)}
              aria-label="Delete card"
              title="Delete"
            >
              ×
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function DueCell({
  card,
  onSetCardDue,
}: {
  card: Task;
  onSetCardDue: (id: number, dueAt: string | null) => void;
}) {
  const value = toDateInput(card.dueAt);
  const state = card.dueAt ? dueState(card.dueAt) : null;
  return (
    <span className={styles.dueCell} data-due={state ?? undefined}>
      <input
        type="date"
        className={styles.dueInput}
        value={value}
        onChange={(e) => onSetCardDue(card.id, e.target.value || null)}
        aria-label="Due date"
      />
      {card.dueAt && (
        <button
          type="button"
          className={styles.dueClear}
          onClick={() => onSetCardDue(card.id, null)}
          aria-label="Clear due date"
          title="Clear"
        >
          ×
        </button>
      )}
    </span>
  );
}

function AddRow({
  pileId,
  onAddCard,
}: {
  pileId: number;
  onAddCard: (pileId: number, title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onAddCard(pileId, title);
    setTitle("");
  };
  return (
    <form className={styles.addRow} onSubmit={submit}>
      <span className={styles.addPlus}>+</span>
      <input
        className={styles.addInput}
        placeholder="Add a card"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={255}
      />
    </form>
  );
}

/* --- display helpers (kept local; pure + tiny) --- */

function toDateInput(dueAt: string | Date | null): string {
  if (!dueAt) return "";
  const d = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  return (
    <span className={styles.dueBadge} data-due={dueState(dueAt)}>
      <CalendarIcon size={12} />
      {formatDueShort(dueAt)}
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
    <span className={styles.avatarStack} title={assignees.map(nameFor).join(", ")}>
      {visible.map((a) => (
        <span key={a.userId} className={styles.avatarPip}>
          {initialsFor(a)}
        </span>
      ))}
      {extra > 0 && <span className={`${styles.avatarPip} ${styles.avatarPipMore}`}>+{extra}</span>}
    </span>
  );
}
