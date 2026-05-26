import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceInvites } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireWorkspaceCap } from "@/lib/workspace-access";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const inviteId = Number(id);
  if (!Number.isFinite(inviteId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [invite] = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.id, inviteId))
    .limit(1);
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const guard = await requireWorkspaceCap(invite.workspaceId, auth.session.sub, "manage_members");
  if (!guard.ok) return guard.response;

  await db
    .update(workspaceInvites)
    .set({ status: "revoked" })
    .where(eq(workspaceInvites.id, inviteId));

  return NextResponse.json({ ok: true });
}
