import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boards, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";

export async function loadBoardForUser(boardId: number, userId: number) {
  const [row] = await db
    .select({
      id: boards.id,
      workspaceId: boards.workspaceId,
      title: boards.title,
      createdAt: boards.createdAt,
    })
    .from(boards)
    .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, boards.workspaceId))
    .where(
      and(
        eq(boards.id, boardId),
        eq(workspaceUsers.userId, userId),
        isNull(boards.deletedAt),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  if (!Number.isFinite(boardId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const board = await loadBoardForUser(boardId, auth.session.sub);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ board });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  if (!Number.isFinite(boardId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const board = await loadBoardForUser(boardId, auth.session.sub);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  const updates: Partial<{ title: string }> = {};
  if (typeof body?.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    if (t.length > 100) return NextResponse.json({ error: "title too long" }, { status: 400 });
    updates.title = t;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  await db.update(boards).set(updates).where(eq(boards.id, boardId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  if (!Number.isFinite(boardId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const board = await loadBoardForUser(boardId, auth.session.sub);
  if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.update(boards).set({ deletedAt: new Date() }).where(eq(boards.id, boardId));
  return NextResponse.json({ ok: true });
}
