import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskAssignees, boardTaskComments, users } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";
import { emitNotifications } from "@/lib/notify";

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

  // Notify the card's assignees (skipping the commenter — emitNotifications
  // also filters self-targeted rows defensively).
  const assigneeRows = await db
    .select({ userId: boardTaskAssignees.userId })
    .from(boardTaskAssignees)
    .where(eq(boardTaskAssignees.boardTaskId, cardId));
  await emitNotifications(
    assigneeRows.map((r) => ({
      userId: r.userId,
      type: "card_comment",
      actorUserId: auth.session.sub,
      cardId,
      boardId: guard.boardId,
      workspaceId: guard.workspaceId,
      payload: { preview: text.slice(0, 140) },
    })),
  );

  return NextResponse.json({
    comment: {
      id: result.insertId,
      body: text,
      createdAt: now,
      updatedAt: now,
      userId: auth.session.sub,
      firstname: me?.firstname ?? null,
      lastname: me?.lastname ?? null,
      email: me?.email ?? null,
    },
  });
}
