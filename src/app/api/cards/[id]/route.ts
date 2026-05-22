import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardTaskAttachments,
  boardTaskItems,
  boardTaskLabels,
  labels,
} from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { loadCardForUser } from "@/lib/card-access";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cardId = Number(id);
  if (!Number.isFinite(cardId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const card = await loadCardForUser(cardId, auth.session.sub);
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const items = await db
    .select({
      id: boardTaskItems.id,
      title: boardTaskItems.title,
      done: boardTaskItems.done,
      position: boardTaskItems.position,
    })
    .from(boardTaskItems)
    .where(and(eq(boardTaskItems.boardTaskId, cardId), isNull(boardTaskItems.deletedAt)))
    .orderBy(asc(boardTaskItems.position), asc(boardTaskItems.id));

  const attachments = await db
    .select({
      id: boardTaskAttachments.id,
      filename: boardTaskAttachments.filename,
      mimeType: boardTaskAttachments.mimeType,
      sizeBytes: boardTaskAttachments.sizeBytes,
      url: boardTaskAttachments.url,
      createdAt: boardTaskAttachments.createdAt,
    })
    .from(boardTaskAttachments)
    .where(
      and(
        eq(boardTaskAttachments.boardTaskId, cardId),
        isNull(boardTaskAttachments.deletedAt),
      ),
    )
    .orderBy(asc(boardTaskAttachments.id));

  const cardLabels = await db
    .select({
      id: labels.id,
      title: labels.title,
      color: labels.color,
      position: labels.position,
    })
    .from(boardTaskLabels)
    .innerJoin(labels, eq(labels.id, boardTaskLabels.labelId))
    .where(and(eq(boardTaskLabels.boardTaskId, cardId), isNull(labels.deletedAt)))
    .orderBy(asc(labels.position), asc(labels.id));

  return NextResponse.json({ card, items, attachments, labels: cardLabels });
}
