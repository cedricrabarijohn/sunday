import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskReactions } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";
import { publishCard } from "@/lib/card-bus";

async function getTaskReactions(cardId: number) {
  const rows = await db
    .select({ userId: boardTaskReactions.userId, emoji: boardTaskReactions.emoji })
    .from(boardTaskReactions)
    .where(and(eq(boardTaskReactions.kind, "task"), eq(boardTaskReactions.targetId, cardId)));
  const map = new Map<string, number[]>();
  for (const r of rows) {
    if (!map.has(r.emoji)) map.set(r.emoji, []);
    map.get(r.emoji)!.push(r.userId);
  }
  return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const cardId = Number((await params).id);
  const guard = await requireCardCap(cardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";
  if (!emoji || emoji.length > 32)
    return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });

  await db
    .insert(boardTaskReactions)
    .values({ kind: "task", targetId: cardId, userId: auth.session.sub, emoji, createdAt: new Date() })
    .onDuplicateKeyUpdate({ set: { createdAt: new Date() } });

  const reactions = await getTaskReactions(cardId);
  publishCard(cardId, { type: "reaction_updated", kind: "task", targetId: cardId, reactions });
  return NextResponse.json({ reactions });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const cardId = Number((await params).id);
  const guard = await requireCardCap(cardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const emoji = typeof body?.emoji === "string" ? body.emoji.trim() : "";
  if (!emoji) return NextResponse.json({ error: "Invalid emoji" }, { status: 400 });

  await db
    .delete(boardTaskReactions)
    .where(
      and(
        eq(boardTaskReactions.kind, "task"),
        eq(boardTaskReactions.targetId, cardId),
        eq(boardTaskReactions.userId, auth.session.sub),
        eq(boardTaskReactions.emoji, emoji),
      ),
    );

  const reactions = await getTaskReactions(cardId);
  publishCard(cardId, { type: "reaction_updated", kind: "task", targetId: cardId, reactions });
  return NextResponse.json({ reactions });
}
