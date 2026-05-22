import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardTaskAttachments,
  boardTaskItems,
  boardTasks,
  boards,
  users,
  workspaceUsers,
  workspaces,
} from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
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
    })
    .from(boards)
    .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
    .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, boards.workspaceId))
    .where(
      and(
        eq(boards.id, boardId),
        eq(workspaceUsers.userId, session.sub),
        isNull(boards.deletedAt),
        isNull(workspaces.deletedAt),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  if (!board) notFound();

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

  const workspaceBoards = await db
    .select({ id: boards.id, title: boards.title })
    .from(boards)
    .where(and(eq(boards.workspaceId, board.workspaceId!), isNull(boards.deletedAt)));

  const rawTasks = await db
    .select({
      id: boardTasks.id,
      title: boardTasks.title,
      done: boardTasks.done,
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

  const tasks = rawTasks.map((t) => {
    const itemStat = itemsById.get(t.id);
    const attachmentStat = attachmentsById.get(t.id);
    return {
      ...t,
      itemsTotal: Number(itemStat?.total ?? 0),
      itemsDone: Number(itemStat?.done ?? 0),
      attachments: Number(attachmentStat?.total ?? 0),
    };
  });

  return (
    <AppShell
      user={user}
      workspaces={allWorkspaces}
      currentWorkspaceId={board.workspaceId ?? undefined}
      currentBoardId={boardId}
      workspaceBoards={workspaceBoards}
    >
      <TasksClient
        boardId={boardId}
        boardTitle={board.title}
        workspaceId={board.workspaceId ?? 0}
        workspaceTitle={board.workspaceTitle}
        initial={tasks}
      />
    </AppShell>
  );
}
