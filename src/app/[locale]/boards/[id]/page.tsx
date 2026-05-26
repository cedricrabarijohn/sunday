import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardPiles,
  boardTaskAttachments,
  boardTaskItems,
  boardTaskLabels,
  boardTasks,
  boardUsers,
  boards,
  labels,
  users,
  workspaceUsers,
  workspaces,
} from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
import { loadBoardCapabilities } from "@/lib/board-access";
import { WORKSPACE_ADMIN_ROLE_ID, loadMembership } from "@/lib/workspace-access";
import AppShell from "../../workspaces/AppShell";
import TasksClient from "./TasksClient";

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

  const itemsById = new Map(itemStats.map((s) => [s.cardId, s]));
  const attachmentsById = new Map(attachmentStats.map((s) => [s.cardId, s]));

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

  const tasks = rawTasks.map((t) => {
    const itemStat = itemsById.get(t.id);
    const attachmentStat = attachmentsById.get(t.id);
    return {
      ...t,
      itemsTotal: Number(itemStat?.total ?? 0),
      itemsDone: Number(itemStat?.done ?? 0),
      attachments: Number(attachmentStat?.total ?? 0),
      labels: labelsByCard.get(t.id) ?? [],
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
        capabilities={capabilities}
      />
    </AppShell>
  );
}
