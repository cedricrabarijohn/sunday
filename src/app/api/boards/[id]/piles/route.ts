import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import { boardPiles } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireBoardCap } from "@/lib/workspace-access";
import { ALLOWED_COLORS } from "@/lib/label-access";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const rows = await db
    .select({
      id: boardPiles.id,
      title: boardPiles.title,
      color: boardPiles.color,
      position: boardPiles.position,
    })
    .from(boardPiles)
    .where(and(eq(boardPiles.boardId, boardId), isNull(boardPiles.deletedAt)))
    .orderBy(asc(boardPiles.position), asc(boardPiles.id));

  return NextResponse.json({ piles: rows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "manage_piles");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const title = (body?.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (title.length > 60) return NextResponse.json({ error: "title too long" }, { status: 400 });

  let color: string | null = null;
  if (typeof body?.color === "string" && body.color.length) {
    if (!ALLOWED_COLORS.has(body.color)) {
      return NextResponse.json({ error: "Unknown color" }, { status: 400 });
    }
    color = body.color;
  }

  const [maxRow] = await db
    .select({ value: max(boardPiles.position) })
    .from(boardPiles)
    .where(eq(boardPiles.boardId, boardId));
  const position = (maxRow?.value ?? 0) + 1;

  const now = new Date();
  const [result] = await db.insert(boardPiles).values({
    boardId,
    title,
    color,
    position,
    createdAt: now,
    updatedAt: now,
  });
  const pileId = Number((result as { insertId: number }).insertId);
  return NextResponse.json({ pile: { id: pileId, title, color, position } }, { status: 201 });
}
