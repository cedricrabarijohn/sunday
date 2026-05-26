import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users, workspaceUsers, workspaces } from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
import { loadCapabilities, loadMembership } from "@/lib/workspace-access";
import AppShell from "../../AppShell";
import MembersClient from "./MembersClient";

export default async function MembersPage({
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

  const membership = await loadMembership(workspaceId, session.sub);
  if (!membership) notFound();

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
    .limit(1);
  if (!workspace) notFound();

  return (
    <AppShell
      user={user}
      workspaces={allWorkspaces}
      currentWorkspaceId={workspaceId}
    >
      <MembersClient
        workspaceId={workspaceId}
        workspaceTitle={workspace.title}
        currentUserId={session.sub}
        capabilities={Array.from(await loadCapabilities(workspaceId, session.sub))}
      />
    </AppShell>
  );
}
