import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTasks, boards, users, workspaceUsers, workspaces } from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
import AppShell from "../../workspaces/AppShell";
import TasksClient from "./TasksClient";
import styles from "../../workspaces/AppShell.module.scss";

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

  const tasks = await db
    .select({ id: boardTasks.id, title: boardTasks.title, position: boardTasks.position })
    .from(boardTasks)
    .where(and(eq(boardTasks.boardId, boardId), isNull(boardTasks.deletedAt)))
    .orderBy(asc(boardTasks.position), asc(boardTasks.id));

  return (
    <AppShell
      user={user}
      crumbs={[
        { label: board.workspaceTitle || "Workspace", href: `/workspaces/${board.workspaceId}` },
        { label: board.title || "Board" },
      ]}
    >
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{board.title || "Untitled board"}</h1>
      </div>
      <TasksClient boardId={boardId} initial={tasks} />
    </AppShell>
  );
}
