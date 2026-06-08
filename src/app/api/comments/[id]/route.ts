import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskComments } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";
import { publishCard } from "@/lib/card-bus";
import { publishCardCounts } from "@/lib/card-counts";

/**
 * Edit own comment. Workspace/board admins may edit anyone's comment —
 * the card-level manage_board_members capability is the marker for
 * "you run this board."
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const commentId = Number(id);
  if (!Number.isFinite(commentId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [comment] = await db
    .select({
      id: boardTaskComments.id,
      boardTaskId: boardTaskComments.boardTaskId,
      userId: boardTaskComments.userId,
    })
    .from(boardTaskComments)
    .where(
      and(eq(boardTaskComments.id, commentId), isNull(boardTaskComments.deletedAt)),
    )
    .limit(1);
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const guard = await requireCardCap(comment.boardTaskId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;
  const isOwn = comment.userId === auth.session.sub;
  const isAdmin = guard.capabilities.has("manage_board_members");
  if (!isOwn && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
  if (text.length > 5000) {
    return NextResponse.json({ error: "Comment too long" }, { status: 400 });
  }

  const now = new Date();
  await db
    .update(boardTaskComments)
    .set({ body: text, updatedAt: now })
    .where(eq(boardTaskComments.id, commentId));

  publishCard(comment.boardTaskId, {
    type: "comment_updated",
    commentId,
    body: text,
    updatedAt: now.toISOString(),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const commentId = Number(id);
  if (!Number.isFinite(commentId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [comment] = await db
    .select({
      id: boardTaskComments.id,
      boardTaskId: boardTaskComments.boardTaskId,
      userId: boardTaskComments.userId,
    })
    .from(boardTaskComments)
    .where(
      and(eq(boardTaskComments.id, commentId), isNull(boardTaskComments.deletedAt)),
    )
    .limit(1);
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const guard = await requireCardCap(comment.boardTaskId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;
  const isOwn = comment.userId === auth.session.sub;
  const isAdmin = guard.capabilities.has("manage_board_members");
  if (!isOwn && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db
    .update(boardTaskComments)
    .set({ deletedAt: new Date() })
    .where(eq(boardTaskComments.id, commentId));

  publishCard(comment.boardTaskId, { type: "comment_deleted", commentId });
  await publishCardCounts(guard.boardId, comment.boardTaskId);

  return NextResponse.json({ ok: true });
}
