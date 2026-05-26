import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { loadMembership } from "@/lib/workspace-access";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  if (!Number.isFinite(workspaceId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const me = await loadMembership(workspaceId, auth.session.sub);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select({
      userId: workspaceUsers.userId,
      workspaceRoleId: workspaceUsers.workspaceRoleId,
      firstname: users.firstname,
      lastname: users.lastname,
      email: users.email,
    })
    .from(workspaceUsers)
    .innerJoin(users, eq(users.id, workspaceUsers.userId))
    .where(
      and(
        eq(workspaceUsers.workspaceId, workspaceId),
        isNull(workspaceUsers.deletedAt),
        isNull(users.deletedAt),
      ),
    );

  return NextResponse.json({ members: rows, currentUserId: auth.session.sub });
}
