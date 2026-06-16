import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardUsers, boards, users, workspaceUsers, workspaces } from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
import { WORKSPACE_ADMIN_ROLE_ID, loadCapabilities, loadMembership } from "@/lib/workspace-access";
import AppShell from "../../AppShell";
import WorkspaceSettingsClient from "./WorkspaceSettingsClient";

export default async function WorkspaceSettingsPage({
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

  const membership = await loadMembership(workspaceId, session.sub);
  if (!membership) notFound();

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
    .limit(1);
  if (!workspace) notFound();

  const caps = await loadCapabilities(workspaceId, session.sub);
  if (!caps.has("edit_workspace") && !caps.has("delete_workspace")) {
    redirect(`/workspaces/${workspaceId}`);
  }

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

  const isWsAdmin = membership.workspaceRoleId === WORKSPACE_ADMIN_ROLE_ID;
  const workspaceBoards = isWsAdmin
    ? await db
        .select({ id: boards.id, title: boards.title })
        .from(boards)
        .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.deletedAt)))
    : await db
        .select({ id: boards.id, title: boards.title })
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
      workspaceBoards={workspaceBoards}
    >
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "1.1rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--text-1)",
          }}
        >
          {workspace.title} — Settings
        </h1>
        <nav style={{ display: "inline-flex", gap: "0.5rem" }}>
          <a
            href={`/workspaces/${workspaceId}`}
            style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none", padding: "0.3rem 0.6rem" }}
          >
            Boards
          </a>
          <a
            href={`/workspaces/${workspaceId}/members`}
            style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none", padding: "0.3rem 0.6rem" }}
          >
            Members
          </a>
          {caps.has("manage_members") && (
            <a
              href={`/workspaces/${workspaceId}/integrations`}
              style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none", padding: "0.3rem 0.6rem" }}
            >
              Integrations
            </a>
          )}
          <a
            href={`/workspaces/${workspaceId}/settings`}
            style={{
              fontSize: "13px",
              color: "var(--text-1)",
              textDecoration: "none",
              padding: "0.3rem 0.6rem",
              fontWeight: 600,
              borderBottom: "2px solid var(--accent)",
            }}
          >
            Settings
          </a>
        </nav>
      </div>
      <WorkspaceSettingsClient
        workspaceId={workspaceId}
        workspaceTitle={workspace.title}
        capabilities={Array.from(caps)}
      />
    </AppShell>
  );
}
