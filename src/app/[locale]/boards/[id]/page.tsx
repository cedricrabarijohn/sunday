import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardColumns,
  boardPiles,
  boardTaskAssignees,
  boardTaskAttachments,
  boardTaskColumns,
  boardTaskComments,
  boardTaskItems,
  boardTaskLabels,
  boardTasks,
  boardUsers,
  boards,
  cardLinks,
  labels,
  users,
  workspaceUsers,
  workspaces,
} from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
import { parseConfig, parseValue } from "@/lib/fields";
import { loadBoardCapabilities } from "@/lib/board-access";
import { WORKSPACE_ADMIN_ROLE_ID, loadCapabilities, loadMembership } from "@/lib/workspace-access";
import AppShell from "../../workspaces/_components/AppShell";
import TasksClient, { type FieldValue } from "./_components/TasksClient";

export default async function BoardDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/users/sign_in");

  const { id } = await params;
  const boardId = Number(id);
  if (!Number.isFinite(boardId)) notFound();

  const [user] = await db
    .select({ firstname: users.firstname, lastname: users.lastname, email: users.email })
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);
  if (!user) redirect("/users/sign_in");

  const [board] = await db
    .select({
      id: boards.id,
      title: boards.title,
      workspaceId: boards.workspaceId,
      workspaceTitle: workspaces.title,
      createdAt: boards.createdAt,
    })
    .from(boards)
    .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
    .where(
      and(
        eq(boards.id, boardId),
        isNull(boards.deletedAt),
        isNull(workspaces.deletedAt),
      ),
    )
    .limit(1);
  if (!board || board.workspaceId == null) notFound();

  const boardCapSet = await loadBoardCapabilities(
    {
      id: board.id,
      workspaceId: board.workspaceId,
      title: board.title,
      createdAt: board.createdAt,
    },
    session.sub,
  );
  if (!boardCapSet.has("view_board")) notFound();

  const allWorkspaces = await db
    .select({ id: workspaces.id, title: workspaces.title })
    .from(workspaces)
    .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceUsers.userId, session.sub),
        isNull(workspaces.deletedAt),
        isNull(workspaceUsers.deletedAt),
      ),
    );

  const wsMembership = await loadMembership(board.workspaceId, session.sub);
  const isWsAdmin = wsMembership?.workspaceRoleId === WORKSPACE_ADMIN_ROLE_ID;
  const wsCapabilities = await loadCapabilities(board.workspaceId, session.sub);
  const canManageMembers = wsCapabilities.has("manage_members");

  const workspaceBoards = isWsAdmin
    ? await db
        .select({ id: boards.id, title: boards.title })
        .from(boards)
        .where(and(eq(boards.workspaceId, board.workspaceId), isNull(boards.deletedAt)))
    : await db
        .select({ id: boards.id, title: boards.title })
        .from(boards)
        .innerJoin(boardUsers, eq(boardUsers.boardId, boards.id))
        .where(
          and(
            eq(boards.workspaceId, board.workspaceId),
            eq(boardUsers.userId, session.sub),
            isNull(boards.deletedAt),
            isNull(boardUsers.deletedAt),
          ),
        );

  const piles = await db
    .select({
      id: boardPiles.id,
      title: boardPiles.title,
      color: boardPiles.color,
      position: boardPiles.position,
    })
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
    })
    .from(boardTasks)
    .where(and(eq(boardTasks.boardId, boardId), isNull(boardTasks.deletedAt)))
    .orderBy(asc(boardTasks.position), asc(boardTasks.id));

  const taskIds = rawTasks.map((t) => t.id);
  const itemStats = taskIds.length
    ? await db
        .select({
          cardId: boardTaskItems.boardTaskId,
          total: sql<number>`COUNT(*)`.as("total"),
          done: sql<number>`SUM(CASE WHEN ${boardTaskItems.done} = 1 THEN 1 ELSE 0 END)`.as("done"),
        })
        .from(boardTaskItems)
        .where(
          and(
            sql`${boardTaskItems.boardTaskId} IN (${sql.join(taskIds, sql`, `)})`,
            isNull(boardTaskItems.deletedAt),
          ),
        )
        .groupBy(boardTaskItems.boardTaskId)
    : [];

  const attachmentStats = taskIds.length
    ? await db
        .select({
          cardId: boardTaskAttachments.boardTaskId,
          total: sql<number>`COUNT(*)`.as("total"),
        })
        .from(boardTaskAttachments)
        .where(
          and(
            sql`${boardTaskAttachments.boardTaskId} IN (${sql.join(taskIds, sql`, `)})`,
            isNull(boardTaskAttachments.deletedAt),
          ),
        )
        .groupBy(boardTaskAttachments.boardTaskId)
    : [];

  const commentStats = taskIds.length
    ? await db
        .select({
          cardId: boardTaskComments.boardTaskId,
          total: sql<number>`COUNT(*)`.as("total"),
        })
        .from(boardTaskComments)
        .where(
          and(
            sql`${boardTaskComments.boardTaskId} IN (${sql.join(taskIds, sql`, `)})`,
            isNull(boardTaskComments.deletedAt),
          ),
        )
        .groupBy(boardTaskComments.boardTaskId)
    : [];

  const linkStats = taskIds.length
    ? await db
        .select({
          cardId: cardLinks.cardId,
          total: sql<number>`COUNT(*)`.as("total"),
        })
        .from(cardLinks)
        .where(sql`${cardLinks.cardId} IN (${sql.join(taskIds, sql`, `)})`)
        .groupBy(cardLinks.cardId)
    : [];

  const itemsById = new Map(itemStats.map((s) => [s.cardId, s]));
  const attachmentsById = new Map(attachmentStats.map((s) => [s.cardId, s]));
  const commentsById = new Map(commentStats.map((s) => [s.cardId, s]));
  const linksById = new Map(linkStats.map((s) => [s.cardId, s]));

  const labelRows = taskIds.length
    ? await db
        .select({
          cardId: boardTaskLabels.boardTaskId,
          id: labels.id,
          title: labels.title,
          color: labels.color,
          position: labels.position,
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

  const labelsByCard = new Map<number, Array<{ id: number; title: string; color: string }>>();
  for (const row of labelRows) {
    const arr = labelsByCard.get(row.cardId) ?? [];
    arr.push({ id: row.id, title: row.title, color: row.color });
    labelsByCard.set(row.cardId, arr);
  }

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

  const assigneesByCard = new Map<
    number,
    Array<{ userId: number; firstname: string | null; lastname: string | null; email: string | null }>
  >();
  for (const row of assigneeRows) {
    const arr = assigneesByCard.get(row.cardId) ?? [];
    arr.push({
      userId: row.userId,
      firstname: row.firstname,
      lastname: row.lastname,
      email: row.email,
    });
    assigneesByCard.set(row.cardId, arr);
  }

  // Custom fields (board columns) and their per-card values.
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
  const boardColumnsOut = columnRows.map((c) => ({ ...c, config: parseConfig(c.config) }));

  const fieldsByCard = new Map<number, Record<number, FieldValue>>();
  if (taskIds.length && boardColumnsOut.length) {
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

  const tasks = rawTasks.map((t) => {
    const itemStat = itemsById.get(t.id);
    const attachmentStat = attachmentsById.get(t.id);
    const commentStat = commentsById.get(t.id);
    const linkStat = linksById.get(t.id);
    return {
      ...t,
      itemsTotal: Number(itemStat?.total ?? 0),
      itemsDone: Number(itemStat?.done ?? 0),
      attachments: Number(attachmentStat?.total ?? 0),
      comments: Number(commentStat?.total ?? 0),
      links: Number(linkStat?.total ?? 0),
      labels: labelsByCard.get(t.id) ?? [],
      assignees: assigneesByCard.get(t.id) ?? [],
      fields: fieldsByCard.get(t.id) ?? {},
    };
  });

  const workspaceLabels = await db
    .select({
      id: labels.id,
      title: labels.title,
      color: labels.color,
      position: labels.position,
      isDefault: labels.isDefault,
    })
    .from(labels)
    .where(and(eq(labels.workspaceId, board.workspaceId!), isNull(labels.deletedAt)))
    .orderBy(asc(labels.position), asc(labels.id));

  const capabilities = Array.from(boardCapSet);

  return (
    <AppShell
      user={user}
      workspaces={allWorkspaces}
      currentWorkspaceId={board.workspaceId}
      currentBoardId={boardId}
      workspaceBoards={workspaceBoards}
      wide
    >
      <TasksClient
        boardId={boardId}
        boardTitle={board.title}
        workspaceId={board.workspaceId ?? 0}
        workspaceTitle={board.workspaceTitle}
        initial={tasks}
        initialPiles={piles}
        initialLabels={workspaceLabels}
        initialColumns={boardColumnsOut}
        capabilities={capabilities}
        canManageMembers={canManageMembers}
        currentUserId={session.sub}
      />
    </AppShell>
  );
}
