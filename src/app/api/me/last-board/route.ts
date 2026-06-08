import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";

/** Record the board the signed-in user last opened (see `/` redirect). */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const boardId = Number(body?.boardId);
  if (!Number.isFinite(boardId) || boardId <= 0) {
    return NextResponse.json({ error: "boardId required" }, { status: 400 });
  }

  // No access check here — the `/` redirect re-validates view access before
  // it ever sends anyone to this board, so a stale or unauthorized id is inert.
  await db
    .update(users)
    .set({ lastBoardId: boardId })
    .where(eq(users.id, auth.session.sub));

  return NextResponse.json({ ok: true });
}
