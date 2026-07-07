/**
 * Loads a whole board's content (piles → cards → description, checklist,
 * labels, assignees, custom fields, comments) for the export route. The board
 * page only loads counts; this loads the full text of everything.
 *
 * Shared by `api/boards/[id]/export`. Serializers (Markdown / DOCX) consume the
 * `BoardExport` shape returned here.
 */

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardColumns,
  boardPiles,
  boardTaskAssignees,
  boardTaskColumns,
  boardTaskComments,
  boardTaskItems,
  boardTaskLabels,
  boardTasks,
  labels,
  users,
} from "@/db/schema";
import { parseConfig, parseValue } from "@/lib/fields";
import { nameFor } from "@/lib/card-format";
import type { BoardColumn, CardAssignee, CardLabel, FieldValue } from "@/lib/board-types";

export type ExportChecklistItem = { title: string; done: boolean };

export type ExportComment = {
  author: string;
  createdAt: Date | string | null;
  body: string;
};

export type ExportTask = {
  id: number;
  title: string | null;
  pileId: number | null;
  position: number | null;
  dueAt: string | Date | null;
  description: string | null;
  labels: CardLabel[];
  assignees: CardAssignee[];
  fields: Record<number, FieldValue>;
  checklist: ExportChecklistItem[];
  comments: ExportComment[];
};

export type ExportPile = {
  id: number;
  title: string;
  cards: ExportTask[];
};

export type BoardExport = {
  board: { id: number; title: string; workspaceTitle: string };
  columns: BoardColumn[];
  piles: ExportPile[];
};

/**
 * Fetch the full board content. Assumes the caller has already loaded the board
 * and checked `view_board` — this does not enforce access.
 */
export async function loadBoardExport(
  board: { id: number; title: string; workspaceTitle: string },
): Promise<BoardExport> {
  const boardId = board.id;

  const piles = await db
    .select({ id: boardPiles.id, title: boardPiles.title })
    .from(boardPiles)
    .where(and(eq(boardPiles.boardId, boardId), isNull(boardPiles.deletedAt)))
    .orderBy(asc(boardPiles.position), asc(boardPiles.id));

  const rawTasks = await db
    .select({
      id: boardTasks.id,
      pileId: boardTasks.pileId,
      title: boardTasks.title,
      position: boardTasks.position,
      dueAt: boardTasks.dueAt,
      description: boardTasks.description,
    })
    .from(boardTasks)
    .where(and(eq(boardTasks.boardId, boardId), isNull(boardTasks.deletedAt)))
    .orderBy(asc(boardTasks.position), asc(boardTasks.id));

  const taskIds = rawTasks.map((t) => t.id);

  // Checklist items.
  const itemRows = taskIds.length
    ? await db
        .select({
          cardId: boardTaskItems.boardTaskId,
          title: boardTaskItems.title,
          done: boardTaskItems.done,
        })
        .from(boardTaskItems)
        .where(
          and(
            sql`${boardTaskItems.boardTaskId} IN (${sql.join(taskIds, sql`, `)})`,
            isNull(boardTaskItems.deletedAt),
          ),
        )
        .orderBy(asc(boardTaskItems.position), asc(boardTaskItems.id))
    : [];
  const itemsByCard = new Map<number, ExportChecklistItem[]>();
  for (const r of itemRows) {
    const arr = itemsByCard.get(r.cardId) ?? [];
    arr.push({ title: r.title ?? "", done: r.done === 1 });
    itemsByCard.set(r.cardId, arr);
  }

  // Labels.
  const labelRows = taskIds.length
    ? await db
        .select({
          cardId: boardTaskLabels.boardTaskId,
          id: labels.id,
          title: labels.title,
          color: labels.color,
        })
        .from(boardTaskLabels)
        .innerJoin(labels, eq(labels.id, boardTaskLabels.labelId))
        .where(
          and(
            sql`${boardTaskLabels.boardTaskId} IN (${sql.join(taskIds, sql`, `)})`,
            isNull(labels.deletedAt),
          ),
        )
        .orderBy(asc(labels.position), asc(labels.id))
    : [];
  const labelsByCard = new Map<number, CardLabel[]>();
  for (const r of labelRows) {
    const arr = labelsByCard.get(r.cardId) ?? [];
    arr.push({ id: r.id, title: r.title, color: r.color });
    labelsByCard.set(r.cardId, arr);
  }

  // Assignees.
  const assigneeRows = taskIds.length
    ? await db
        .select({
          cardId: boardTaskAssignees.boardTaskId,
          userId: users.id,
          firstname: users.firstname,
          lastname: users.lastname,
          email: users.email,
        })
        .from(boardTaskAssignees)
        .innerJoin(users, eq(users.id, boardTaskAssignees.userId))
        .where(sql`${boardTaskAssignees.boardTaskId} IN (${sql.join(taskIds, sql`, `)})`)
    : [];
  const assigneesByCard = new Map<number, CardAssignee[]>();
  for (const r of assigneeRows) {
    const arr = assigneesByCard.get(r.cardId) ?? [];
    arr.push({ userId: r.userId, firstname: r.firstname, lastname: r.lastname, email: r.email });
    assigneesByCard.set(r.cardId, arr);
  }

  // Custom fields (definitions + per-card values).
  const columnRows = await db
    .select({
      id: boardColumns.id,
      label: boardColumns.label,
      type: boardColumns.type,
      config: boardColumns.config,
      position: boardColumns.position,
    })
    .from(boardColumns)
    .where(and(eq(boardColumns.boardId, boardId), isNull(boardColumns.deletedAt)))
    .orderBy(asc(boardColumns.position), asc(boardColumns.id));
  const columns: BoardColumn[] = columnRows.map((c) => ({ ...c, config: parseConfig(c.config) }));

  const fieldsByCard = new Map<number, Record<number, FieldValue>>();
  if (taskIds.length && columns.length) {
    const valueRows = await db
      .select({
        cardId: boardTaskColumns.boardTaskId,
        columnId: boardTaskColumns.boardColumnId,
        value: boardTaskColumns.value,
      })
      .from(boardTaskColumns)
      .where(sql`${boardTaskColumns.boardTaskId} IN (${sql.join(taskIds, sql`, `)})`);
    for (const v of valueRows) {
      if (v.cardId == null || v.columnId == null) continue;
      const m = fieldsByCard.get(v.cardId) ?? {};
      m[v.columnId] = parseValue(v.value) as FieldValue;
      fieldsByCard.set(v.cardId, m);
    }
  }

  // Comments (with author + timestamp).
  const commentRows = taskIds.length
    ? await db
        .select({
          cardId: boardTaskComments.boardTaskId,
          body: boardTaskComments.body,
          createdAt: boardTaskComments.createdAt,
          firstname: users.firstname,
          lastname: users.lastname,
          email: users.email,
        })
        .from(boardTaskComments)
        .innerJoin(users, eq(users.id, boardTaskComments.userId))
        .where(
          and(
            sql`${boardTaskComments.boardTaskId} IN (${sql.join(taskIds, sql`, `)})`,
            isNull(boardTaskComments.deletedAt),
          ),
        )
        .orderBy(asc(boardTaskComments.createdAt), asc(boardTaskComments.id))
    : [];
  const commentsByCard = new Map<number, ExportComment[]>();
  for (const r of commentRows) {
    const arr = commentsByCard.get(r.cardId) ?? [];
    arr.push({
      author: nameFor({ userId: 0, firstname: r.firstname, lastname: r.lastname, email: r.email }),
      createdAt: r.createdAt,
      body: r.body ?? "",
    });
    commentsByCard.set(r.cardId, arr);
  }

  const cards: ExportTask[] = rawTasks.map((t) => ({
    id: t.id,
    title: t.title,
    pileId: t.pileId,
    position: t.position,
    dueAt: t.dueAt,
    description: t.description,
    labels: labelsByCard.get(t.id) ?? [],
    assignees: assigneesByCard.get(t.id) ?? [],
    fields: fieldsByCard.get(t.id) ?? {},
    checklist: itemsByCard.get(t.id) ?? [],
    comments: commentsByCard.get(t.id) ?? [],
  }));

  const cardsByPile = new Map<number, ExportTask[]>();
  for (const c of cards) {
    if (c.pileId == null) continue;
    const arr = cardsByPile.get(c.pileId) ?? [];
    arr.push(c);
    cardsByPile.set(c.pileId, arr);
  }

  return {
    board,
    columns,
    piles: piles.map((p) => ({
      id: p.id,
      title: p.title,
      cards: cardsByPile.get(p.id) ?? [],
    })),
  };
}
