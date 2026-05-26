import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import { boardPiles, boardTasks } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireBoardCap } from "@/lib/workspace-access";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "view_workspace");
  if (!guard.ok) return guard.response;

  const tasks = await db
    .select({
      id: boardTasks.id,
      pileId: boardTasks.pileId,
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
  const guard = await requireBoardCap(boardId, auth.session.sub, "create_card");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const title = (body?.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (title.length > 255) return NextResponse.json({ error: "title too long" }, { status: 400 });

  // Resolve target pile
  let pileId: number | null = null;
  if (typeof body?.pileId === "number") {
    const [pile] = await db
      .select({ id: boardPiles.id, boardId: boardPiles.boardId })
      .from(boardPiles)
      .where(and(eq(boardPiles.id, body.pileId), isNull(boardPiles.deletedAt)))
      .limit(1);
    if (!pile || pile.boardId !== boardId) {
      return NextResponse.json({ error: "Invalid pile" }, { status: 400 });
    }
    pileId = pile.id;
  } else {
    const [firstPile] = await db
      .select({ id: boardPiles.id })
      .from(boardPiles)
      .where(and(eq(boardPiles.boardId, boardId), isNull(boardPiles.deletedAt)))
      .orderBy(asc(boardPiles.position), asc(boardPiles.id))
      .limit(1);
    if (firstPile) pileId = firstPile.id;
  }

  // Append: position = max within the same pile + 1 (or board-wide if no pile)
  const positionCondition = pileId !== null ? eq(boardTasks.pileId, pileId) : eq(boardTasks.boardId, boardId);
  const [maxRow] = await db
    .select({ value: max(boardTasks.position) })
    .from(boardTasks)
    .where(positionCondition);
  const position = (maxRow?.value ?? 0) + 1;

  const now = new Date();
  const [result] = await db.insert(boardTasks).values({
    boardId,
    pileId,
    title,
    position,
    createdAt: now,
    updatedAt: now,
  });
  const taskId = Number((result as { insertId: number }).insertId);

  return NextResponse.json(
    { task: { id: taskId, title, pileId, position, boardId, createdAt: now, updatedAt: now } },
    { status: 201 },
  );
}
