import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskComments, boardTaskReactions } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";
import { publishCard } from "@/lib/card-bus";

async function getCommentReactions(commentId: number) {
  const rows = await db
    .select({ userId: boardTaskReactions.userId, emoji: boardTaskReactions.emoji })
    .from(boardTaskReactions)
    .where(and(eq(boardTaskReactions.kind, "comment"), eq(boardTaskReactions.targetId, commentId)));
  const map = new Map<string, number[]>();
  for (const r of rows) {
    if (!map.has(r.emoji)) map.set(r.emoji, []);
    map.get(r.emoji)!.push(r.userId);
  }
  return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
}

async function getComment(commentId: number) {
  const [comment] = await db
    .select({ id: boardTaskComments.id, boardTaskId: boardTaskComments.boardTaskId })
    .from(boardTaskComments)
    .where(and(eq(boardTaskComments.id, commentId), isNull(boardTaskComments.deletedAt)))
    .limit(1);
  return comment ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const commentId = Number((await params).id);
  if (!Number.isFinite(commentId))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const comment = await getComment(commentId);
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const guard = await requireCardCap(comment.boardTaskId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";
  if (!emoji || emoji.length > 32)
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });

  await db
    .insert(boardTaskReactions)
    .values({ kind: "comment", targetId: commentId, userId: auth.session.sub, emoji, createdAt: new Date() })
    .onDuplicateKeyUpdate({ set: { createdAt: new Date() } });

  const reactions = await getCommentReactions(commentId);
  publishCard(comment.boardTaskId, {
    type: "reaction_updated",
    kind: "comment",
    targetId: commentId,
    reactions,
  });
  return NextResponse.json({ reactions });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const commentId = Number((await params).id);
  if (!Number.isFinite(commentId))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const comment = await getComment(commentId);
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const guard = await requireCardCap(comment.boardTaskId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";
  if (!emoji) return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });

  await db
    .delete(boardTaskReactions)
    .where(
      and(
        eq(boardTaskReactions.kind, "comment"),
        eq(boardTaskReactions.targetId, commentId),
        eq(boardTaskReactions.userId, auth.session.sub),
        eq(boardTaskReactions.emoji, emoji),
      ),
    );

  const reactions = await getCommentReactions(commentId);
  publishCard(comment.boardTaskId, {
    type: "reaction_updated",
    kind: "comment",
    targetId: commentId,
    reactions,
  });
  return NextResponse.json({ reactions });
}
