import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardUsers, boards, labels, users, workspaceUsers, workspaces } from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
import { loadBoardCapabilities } from "@/lib/board-access";
import {
  WORKSPACE_ADMIN_ROLE_ID,
  loadMembership,
} from "@/lib/workspace-access";
import AppShell from "@/components/organisms/workspaces/AppShell";
import LabelsClient from "@/components/organisms/board-labels/LabelsClient";

export default async function BoardLabelsPage({ params }: { params: Promise<{ id: string }> }) {
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
    .leftJoin(workspaces, eq(workspaces.id, boards.workspaceId))
    .where(and(eq(boards.id, boardId), isNull(boards.deletedAt)))
    .limit(1);
  if (!board || board.workspaceId == null) notFound();

  const caps = await loadBoardCapabilities(
    { id: board.id, workspaceId: board.workspaceId, title: board.title, createdAt: board.createdAt },
    session.sub,
  );
  if (!caps.has("view_board")) notFound();

  // Labels are board-scoped; managing the catalog needs the edit_board cap.
  const canManageLabels = caps.has("edit_board");

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

  const labelRows = await db
    .select({
      id: labels.id,
      title: labels.title,
      color: labels.color,
      description: labels.description,
      position: labels.position,
      isDefault: labels.isDefault,
    })
    .from(labels)
    .where(and(eq(labels.boardId, board.id), isNull(labels.deletedAt)))
    .orderBy(asc(labels.position), asc(labels.id));

  return (
    <AppShell
      user={user}
      workspaces={allWorkspaces}
      currentWorkspaceId={board.workspaceId}
      currentBoardId={boardId}
      workspaceBoards={workspaceBoards}
    >
      <LabelsClient
        boardId={boardId}
        boardTitle={board.title}
        workspaceId={board.workspaceId}
        workspaceTitle={board.workspaceTitle}
        canManage={canManageLabels}
        initialLabels={labelRows}
      />
    </AppShell>
  );
}
