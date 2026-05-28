import { NextRequest, NextResponse } from "next/server";
import { aliasedTable, and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boards,
  boardTasks,
  notifications,
  users,
  workspaces,
} from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const onlyUnread = request.nextUrl.searchParams.get("unread") === "1";
  const limit = Math.min(
    Number(request.nextUrl.searchParams.get("limit") ?? 50),
    100,
  );

  const actor = aliasedTable(users, "actor");

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      payload: notifications.payload,
      cardId: notifications.cardId,
      boardId: notifications.boardId,
      workspaceId: notifications.workspaceId,
      actorUserId: notifications.actorUserId,
      actorFirstname: actor.firstname,
      actorLastname: actor.lastname,
      actorEmail: actor.email,
      cardTitle: boardTasks.title,
      boardTitle: boards.title,
      workspaceTitle: workspaces.title,
    })
    .from(notifications)
    .leftJoin(actor, eq(actor.id, notifications.actorUserId))
    .leftJoin(boardTasks, eq(boardTasks.id, notifications.cardId))
    .leftJoin(boards, eq(boards.id, notifications.boardId))
    .leftJoin(workspaces, eq(workspaces.id, notifications.workspaceId))
    .where(
      and(
        eq(notifications.userId, auth.session.sub),
        onlyUnread ? isNull(notifications.readAt) : sql`1 = 1`,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);

  const [{ count: unread }] = await db
    .select({ count: sql<number>`COUNT(*)`.as("count") })
    .from(notifications)
    .where(
      and(eq(notifications.userId, auth.session.sub), isNull(notifications.readAt)),
    );

  return NextResponse.json({ notifications: rows, unread: Number(unread) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const all = body?.all === true;
  const ids = Array.isArray(body?.ids)
    ? (body.ids as unknown[]).map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : [];

  if (!all && ids.length === 0) {
    return NextResponse.json({ error: "Pass { all: true } or { ids: number[] }" }, { status: 400 });
  }

  const now = new Date();
  if (all) {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(eq(notifications.userId, auth.session.sub), isNull(notifications.readAt)),
      );
  } else {
    await db
      .update(notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(notifications.userId, auth.session.sub),
          sql`${notifications.id} IN (${sql.join(ids, sql`, `)})`,
        ),
      );
  }

  return NextResponse.json({ ok: true });
}
