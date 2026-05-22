import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskItems, boardTasks, boards, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";

async function loadItemForUser(itemId: number, userId: number) {
  const [row] = await db
    .select({
      id: boardTaskItems.id,
      boardTaskId: boardTaskItems.boardTaskId,
      title: boardTaskItems.title,
      done: boardTaskItems.done,
    })
    .from(boardTaskItems)
    .innerJoin(boardTasks, eq(boardTasks.id, boardTaskItems.boardTaskId))
    .innerJoin(boards, eq(boards.id, boardTasks.boardId))
    .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, boards.workspaceId))
    .where(
      and(
        eq(boardTaskItems.id, itemId),
        eq(workspaceUsers.userId, userId),
        isNull(boardTaskItems.deletedAt),
        isNull(boardTasks.deletedAt),
        isNull(boards.deletedAt),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const item = await loadItemForUser(itemId, auth.session.sub);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const updates: Partial<{ title: string; done: number }> = {};
  if (typeof body?.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    if (t.length > 255) return NextResponse.json({ error: "title too long" }, { status: 400 });
    updates.title = t;
  }
  if (typeof body?.done === "boolean") {
    updates.done = body.done ? 1 : 0;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  await db
    .update(boardTaskItems)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(boardTaskItems.id, itemId));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const item = await loadItemForUser(itemId, auth.session.sub);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(boardTaskItems)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(boardTaskItems.id, itemId));

  return NextResponse.json({ ok: true });
}
