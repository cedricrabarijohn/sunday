import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceUsers } from "@/db/schema";

export const WORKSPACE_ADMIN_ROLE_ID = 1;
export const WORKSPACE_MEMBER_ROLE_ID = 2;

export type WorkspaceMembership = {
  workspaceRoleId: number | null;
};

/** Returns the membership row for (workspace, user) or null. */
export async function loadMembership(
  workspaceId: number,
  userId: number,
): Promise<WorkspaceMembership | null> {
  const [row] = await db
    .select({ workspaceRoleId: workspaceUsers.workspaceRoleId })
    .from(workspaceUsers)
    .where(
      and(
        eq(workspaceUsers.workspaceId, workspaceId),
        eq(workspaceUsers.userId, userId),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export function isAdmin(membership: WorkspaceMembership | null): boolean {
  return membership?.workspaceRoleId === WORKSPACE_ADMIN_ROLE_ID;
}
