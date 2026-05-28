import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardTaskAssignees,
  boardTaskAttachments,
  boardTaskComments,
  boardTaskItems,
  boardTaskLabels,
  labels,
  users,
} from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cardId = Number(id);
  const guard = await requireCardCap(cardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

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

  const assignees = await db
    .select({
      userId: users.id,
      firstname: users.firstname,
      lastname: users.lastname,
      email: users.email,
    })
    .from(boardTaskAssignees)
    .innerJoin(users, eq(users.id, boardTaskAssignees.userId))
    .where(eq(boardTaskAssignees.boardTaskId, cardId))
    .orderBy(asc(users.firstname), asc(users.id));

  const comments = await db
    .select({
      id: boardTaskComments.id,
      body: boardTaskComments.body,
      createdAt: boardTaskComments.createdAt,
      updatedAt: boardTaskComments.updatedAt,
      userId: users.id,
      firstname: users.firstname,
      lastname: users.lastname,
      email: users.email,
    })
    .from(boardTaskComments)
    .innerJoin(users, eq(users.id, boardTaskComments.userId))
    .where(
      and(
        eq(boardTaskComments.boardTaskId, cardId),
        isNull(boardTaskComments.deletedAt),
      ),
    )
    .orderBy(asc(boardTaskComments.createdAt), asc(boardTaskComments.id));

  return NextResponse.json({
    card: guard.card,
    items,
    attachments,
    labels: cardLabels,
    assignees,
    comments,
    capabilities: Array.from(guard.capabilities),
    currentUserId: auth.session.sub,
  });
}
