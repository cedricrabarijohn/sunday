import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTasks, boards, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";

async function loadTaskForUser(taskId: number, userId: number) {
  const [row] = await db
    .select({
      id: boardTasks.id,
      title: boardTasks.title,
      boardId: boardTasks.boardId,
      position: boardTasks.position,
    })
    .from(boardTasks)
    .innerJoin(boards, eq(boards.id, boardTasks.boardId))
    .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, boards.workspaceId))
    .where(
      and(
        eq(boardTasks.id, taskId),
        eq(workspaceUsers.userId, userId),
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
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const task = await loadTaskForUser(taskId, auth.session.sub);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const updates: Partial<{ title: string }> = {};
  if (typeof body?.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    if (t.length > 255) return NextResponse.json({ error: "title too long" }, { status: 400 });
    updates.title = t;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  await db
    .update(boardTasks)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(boardTasks.id, taskId));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isFinite(taskId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const task = await loadTaskForUser(taskId, auth.session.sub);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(boardTasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(boardTasks.id, taskId));

  return NextResponse.json({ ok: true });
}
