import { NextResponse } from "next/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import {
  WORKSPACE_ADMIN_ROLE_ID,
  loadCapabilities,
  loadMembership,
} from "@/lib/workspace-access";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, userId } = await params;
  const workspaceId = Number(id);
  const targetId = Number(userId);
  if (!Number.isFinite(workspaceId) || !Number.isFinite(targetId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const me = await loadMembership(workspaceId, auth.session.sub);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Members can leave the workspace themselves. Removing someone else
  // requires the manage_members capability.
  const removingSelf = targetId === auth.session.sub;
  if (!removingSelf) {
    const caps = await loadCapabilities(workspaceId, auth.session.sub);
    if (!caps.has("manage_members")) {
      return NextResponse.json({ error: "Missing capability: manage_members" }, { status: 403 });
    }
  }

  // Refuse to leave the workspace stranded with no admin.
  const target = await loadMembership(workspaceId, targetId);
  if (!target) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  if (target.workspaceRoleId === WORKSPACE_ADMIN_ROLE_ID) {
    const [otherAdmin] = await db
      .select({ userId: workspaceUsers.userId })
      .from(workspaceUsers)
      .where(
        and(
          eq(workspaceUsers.workspaceId, workspaceId),
          eq(workspaceUsers.workspaceRoleId, WORKSPACE_ADMIN_ROLE_ID),
          ne(workspaceUsers.userId, targetId),
          isNull(workspaceUsers.deletedAt),
        ),
      )
      .limit(1);
    if (!otherAdmin) {
      return NextResponse.json(
        { error: "Cannot remove the last admin. Promote someone else first." },
        { status: 409 },
      );
    }
  }

  await db
    .update(workspaceUsers)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(workspaceUsers.workspaceId, workspaceId),
        eq(workspaceUsers.userId, targetId),
      ),
    );

  return NextResponse.json({ ok: true });
}
