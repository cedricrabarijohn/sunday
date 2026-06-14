import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardUsers, boards, scmConnections, users, workspaceUsers, workspaces } from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
import { WORKSPACE_ADMIN_ROLE_ID, loadCapabilities, loadMembership } from "@/lib/workspace-access";
import { appUrl } from "@/lib/mail";
import AppShell from "../../AppShell";
import IntegrationsClient from "./IntegrationsClient";

export default async function IntegrationsPage({ params }: { params: Promise<{ id: string }> }) {
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

  const caps = await loadCapabilities(workspaceId, session.sub);
  if (!caps.has("manage_members")) notFound();

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

  const [workspace] = await db
    .select({ id: workspaces.id, title: workspaces.title })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
    .limit(1);
  if (!workspace) notFound();

  const membership = await loadMembership(workspaceId, session.sub);
  const isWsAdmin = membership?.workspaceRoleId === WORKSPACE_ADMIN_ROLE_ID;
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

  const conns = await db
    .select()
    .from(scmConnections)
    .where(eq(scmConnections.workspaceId, workspaceId));

  const SUPPORTED = ["gitea", "github"] as const;
  const providers = SUPPORTED.map((provider) => {
    const conn = conns.find((c) => c.provider === provider);
    return conn
      ? {
          provider,
          connected: true,
          baseUrl: conn.baseUrl ?? "",
          enabled: conn.enabled === 1,
          secret: conn.secret ?? "",
          donePileName: conn.donePileName ?? "",
          webhookUrl: `${appUrl()}/api/webhooks/${provider}/${conn.webhookToken}`,
        }
      : {
          provider,
          connected: false,
          baseUrl: "",
          enabled: true,
          secret: "",
          donePileName: "",
          webhookUrl: "",
        };
  });

  return (
    <AppShell
      user={user}
      workspaces={allWorkspaces}
      currentWorkspaceId={workspaceId}
      workspaceBoards={workspaceBoards}
    >
      <IntegrationsClient
        workspaceId={workspaceId}
        workspaceTitle={workspace.title}
        providers={providers}
      />
    </AppShell>
  );
}
