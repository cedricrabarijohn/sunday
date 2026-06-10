import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users, workspaceUsers, workspaces } from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";
import AppShell from "../../workspaces/AppShell";
import AccountSettingsClient from "./AccountSettingsClient";

export default async function AccountSettingsPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/users/sign_in");

  const [user] = await db
    .select({
      firstname: users.firstname,
      lastname: users.lastname,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
    })
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

  return (
    <AppShell user={user} workspaces={allWorkspaces}>
      <AccountSettingsClient
        initial={{
          firstname: user.firstname ?? "",
          lastname: user.lastname ?? "",
          email: user.email ?? "",
          emailVerified: user.emailVerifiedAt != null,
        }}
      />
    </AppShell>
  );
}
