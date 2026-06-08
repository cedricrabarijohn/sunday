import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardTaskAssignees,
  boardTaskComments,
  boardUsers,
  users,
  workspaceUsers,
} from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap, WORKSPACE_ADMIN_ROLE_ID } from "@/lib/workspace-access";
import { emitNotifications } from "@/lib/notify";
import { extractMentionedUserIds } from "@/lib/mentions";
import { publishCard } from "@/lib/card-bus";
import { publishCardCounts } from "@/lib/card-counts";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cardId = Number(id);
  const guard = await requireCardCap(cardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const rows = await db
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

  return NextResponse.json({ comments: rows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cardId = Number(id);
  const guard = await requireCardCap(cardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
  if (text.length > 5000) {
    return NextResponse.json({ error: "Comment too long" }, { status: 400 });
  }

  const now = new Date();
  const [result] = await db.insert(boardTaskComments).values({
    boardTaskId: cardId,
    userId: auth.session.sub,
    body: text,
    createdAt: now,
    updatedAt: now,
  });

  const [me] = await db
    .select({
      firstname: users.firstname,
      lastname: users.lastname,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, auth.session.sub))
    .limit(1);

  // Notify the card's assignees + anyone mentioned inline. Filter
  // mentioned IDs to people who can actually see the board, so a
  // typo'd token doesn't ping a stranger. Mentions take precedence
  // over generic "new comment on a card you're assigned to" — when a
  // user is both assigned and mentioned we send a single mention
  // notification.
  const assigneeRows = await db
    .select({ userId: boardTaskAssignees.userId })
    .from(boardTaskAssignees)
    .where(eq(boardTaskAssignees.boardTaskId, cardId));

  const rawMentionIds = extractMentionedUserIds(text);
  let validMentionIds: number[] = [];
  if (rawMentionIds.length > 0) {
    const eligible = new Set<number>();
    const memberRows = await db
      .select({ userId: boardUsers.userId })
      .from(boardUsers)
      .where(
        and(
          eq(boardUsers.boardId, guard.boardId),
          inArray(boardUsers.userId, rawMentionIds),
          isNull(boardUsers.deletedAt),
        ),
      );
    for (const r of memberRows) eligible.add(r.userId);
    const adminRows = await db
      .select({ userId: workspaceUsers.userId })
      .from(workspaceUsers)
      .where(
        and(
          eq(workspaceUsers.workspaceId, guard.workspaceId),
          eq(workspaceUsers.workspaceRoleId, WORKSPACE_ADMIN_ROLE_ID),
          inArray(workspaceUsers.userId, rawMentionIds),
          isNull(workspaceUsers.deletedAt),
        ),
      );
    for (const r of adminRows) eligible.add(r.userId);
    validMentionIds = rawMentionIds.filter((id) => eligible.has(id));
  }

  const mentionSet = new Set(validMentionIds);
  const commentTargets = assigneeRows
    .map((r) => r.userId)
    .filter((uid) => !mentionSet.has(uid));

  await emitNotifications([
    ...validMentionIds.map((userId) => ({
      userId,
      type: "card_mention" as const,
      actorUserId: auth.session.sub,
      cardId,
      boardId: guard.boardId,
      workspaceId: guard.workspaceId,
      payload: { preview: text.slice(0, 140) },
    })),
    ...commentTargets.map((userId) => ({
      userId,
      type: "card_comment" as const,
      actorUserId: auth.session.sub,
      cardId,
      boardId: guard.boardId,
      workspaceId: guard.workspaceId,
      payload: { preview: text.slice(0, 140) },
    })),
  ]);

  const created = {
    id: result.insertId,
    body: text,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    userId: auth.session.sub,
    firstname: me?.firstname ?? null,
    lastname: me?.lastname ?? null,
    email: me?.email ?? null,
  };

  publishCard(cardId, { type: "comment_created", comment: created });
  await publishCardCounts(guard.boardId, cardId);

  return NextResponse.json({ comment: created });
}
