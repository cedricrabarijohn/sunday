import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardUsers, boards, users, workspaceUsers, workspaces } from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
import { WORKSPACE_ADMIN_ROLE_ID, loadCapabilities, loadMembership } from "@/lib/workspace-access";
import AppShell from "../_components/AppShell";
import BoardsClient from "./_components/BoardsClient";

export default async function WorkspaceDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionFromCookie();
  if (!session) redirect("/users/sign_in");

  const { id } = await params;
  const workspaceId = Number(id);
  if (!Number.isFinite(workspaceId)) notFound();

  const [user] = await db
    .select({ firstname: users.firstname, lastname: users.lastname, email: users.email })
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);
  if (!user) redirect("/users/sign_in");

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

  const membership = allWorkspaces.find((w) => w.id === workspaceId);
  if (!membership) notFound();

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
    .limit(1);
  if (!workspace) notFound();

  const wsMembership = await loadMembership(workspaceId, session.sub);
  const isWsAdmin = wsMembership?.workspaceRoleId === WORKSPACE_ADMIN_ROLE_ID;

  const boardRows = isWsAdmin
    ? await db
        .select({ id: boards.id, title: boards.title, createdAt: boards.createdAt })
        .from(boards)
        .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.deletedAt)))
    : await db
        .select({ id: boards.id, title: boards.title, createdAt: boards.createdAt })
        .from(boards)
        .innerJoin(boardUsers, eq(boardUsers.boardId, boards.id))
        .where(
          and(
            eq(boards.workspaceId, workspaceId),
            eq(boardUsers.userId, session.sub),
            isNull(boards.deletedAt),
            isNull(boardUsers.deletedAt),
          ),
        );

  return (
    <AppShell
      user={user}
      workspaces={allWorkspaces}
      currentWorkspaceId={workspaceId}
      workspaceBoards={boardRows}
    >
      <BoardsClient
        workspaceId={workspaceId}
        workspaceTitle={workspace.title}
        initial={boardRows}
        capabilities={Array.from(await loadCapabilities(workspaceId, session.sub))}
      />
    </AppShell>
  );
}
