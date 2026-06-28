import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskLabels, labels } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";
import { publishBoard } from "@/lib/board-bus";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cardId = Number(id);
  const guard = await requireCardCap(cardId, auth.session.sub, "edit_card");
  if (!guard.ok) return guard.response;
  const boardId = guard.boardId;

  const body = await request.json().catch(() => null);
  const rawIds = Array.isArray(body?.labelIds) ? body.labelIds : null;
  if (!rawIds) {
    return NextResponse.json({ error: "labelIds array is required" }, { status: 400 });
  }
  const labelIds = Array.from(
    new Set(rawIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))),
  ) as number[];

  // Ensure every label belongs to the card's board.
  if (labelIds.length > 0) {
    const validLabels = await db
      .select({ id: labels.id })
      .from(labels)
      .where(
        and(
          eq(labels.boardId, boardId),
          inArray(labels.id, labelIds),
          isNull(labels.deletedAt),
        ),
      );
    const validIds = new Set(validLabels.map((l) => l.id));
    const allValid = labelIds.every((id: number) => validIds.has(id));
    if (!allValid) {
      return NextResponse.json({ error: "One or more labels are invalid" }, { status: 400 });
    }
  }

  await db.delete(boardTaskLabels).where(eq(boardTaskLabels.boardTaskId, cardId));
  if (labelIds.length > 0) {
    const now = new Date();
    await db.insert(boardTaskLabels).values(
      labelIds.map((labelId: number) => ({
        boardTaskId: cardId,
        labelId,
        createdAt: now,
      })),
    );
  }

  publishBoard(guard.boardId, { type: "card_labels", cardId, labelIds });

  return NextResponse.json({ ok: true, labelIds });
}
