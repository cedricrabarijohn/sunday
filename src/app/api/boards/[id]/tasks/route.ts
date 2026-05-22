import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTasks } from "@/db/schema";
import { loadBoardForUser } from "../route";
import { requireAuth } from "@/lib/require-auth";

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

  const tasks = await db
    .select({
      id: boardTasks.id,
      title: boardTasks.title,
      position: boardTasks.position,
      createdAt: boardTasks.createdAt,
      updatedAt: boardTasks.updatedAt,
    })
    .from(boardTasks)
    .where(and(eq(boardTasks.boardId, boardId), isNull(boardTasks.deletedAt)))
    .orderBy(asc(boardTasks.position), asc(boardTasks.id));

  return NextResponse.json({ tasks });
}

export async function POST(
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
  const title = (body?.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (title.length > 255) return NextResponse.json({ error: "title too long" }, { status: 400 });

  const [maxRow] = await db
    .select({ value: max(boardTasks.position) })
    .from(boardTasks)
    .where(eq(boardTasks.boardId, boardId));
  const position = (maxRow?.value ?? 0) + 1;

  const now = new Date();
  const [result] = await db.insert(boardTasks).values({
    boardId,
    title,
    position,
    createdAt: now,
    updatedAt: now,
  });
  const taskId = Number((result as { insertId: number }).insertId);

  return NextResponse.json(
    { task: { id: taskId, title, position, boardId, createdAt: now, updatedAt: now } },
    { status: 201 },
  );
}
