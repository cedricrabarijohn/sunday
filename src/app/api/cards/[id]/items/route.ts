import { NextRequest, NextResponse } from "next/server";
import { eq, max } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskItems } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";
import { publishCardCounts } from "@/lib/card-counts";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cardId = Number(id);
  const guard = await requireCardCap(cardId, auth.session.sub, "edit_card");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const title = (body?.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (title.length > 255) return NextResponse.json({ error: "title too long" }, { status: 400 });

  const [maxRow] = await db
    .select({ value: max(boardTaskItems.position) })
    .from(boardTaskItems)
    .where(eq(boardTaskItems.boardTaskId, cardId));
  const position = (maxRow?.value ?? 0) + 1;

  const now = new Date();
  const [result] = await db.insert(boardTaskItems).values({
    boardTaskId: cardId,
    title,
    done: 0,
    position,
    createdAt: now,
    updatedAt: now,
  });
  const itemId = Number((result as { insertId: number }).insertId);

  await publishCardCounts(guard.boardId, cardId);

  return NextResponse.json(
    { item: { id: itemId, title, done: 0, position } },
    { status: 201 },
  );
}
