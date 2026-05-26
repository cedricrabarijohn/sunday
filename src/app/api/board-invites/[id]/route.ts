import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { boardInvites } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireBoardCap } from "@/lib/workspace-access";

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
    .from(boardInvites)
    .where(eq(boardInvites.id, inviteId))
    .limit(1);
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const guard = await requireBoardCap(invite.boardId, auth.session.sub, "manage_board_members");
  if (!guard.ok) return guard.response;

  await db
    .update(boardInvites)
    .set({ status: "revoked" })
    .where(eq(boardInvites.id, inviteId));

  return NextResponse.json({ ok: true });
}
