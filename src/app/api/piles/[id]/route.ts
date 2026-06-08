import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardPiles, boardTasks } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requirePileCap } from "@/lib/workspace-access";
import { ALLOWED_COLORS } from "@/lib/label-access";
import { publishBoard } from "@/lib/board-bus";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const pileId = Number(id);
  const guard = await requirePileCap(pileId, auth.session.sub, "manage_piles");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const updates: Partial<{ title: string; color: string | null; position: number }> = {};

  if (typeof body?.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    if (t.length > 60) return NextResponse.json({ error: "title too long" }, { status: 400 });
    updates.title = t;
  }
  if (body && Object.prototype.hasOwnProperty.call(body, "color")) {
    if (body.color === null || body.color === "") {
      updates.color = null;
    } else if (typeof body.color === "string" && ALLOWED_COLORS.has(body.color)) {
      updates.color = body.color;
    } else {
      return NextResponse.json({ error: "Unknown color" }, { status: 400 });
    }
  }
  if (typeof body?.position === "number" && Number.isFinite(body.position)) {
    updates.position = body.position;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  await db
    .update(boardPiles)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(boardPiles.id, pileId));

  if (updates.title !== undefined) {
    publishBoard(guard.boardId, {
      type: "pile_updated",
      pileId,
      title: updates.title,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const pileId = Number(id);
  const guard = await requirePileCap(pileId, auth.session.sub, "manage_piles");
  if (!guard.ok) return guard.response;

  const [countRow] = await db
    .select({ id: boardTasks.id })
    .from(boardTasks)
    .where(and(eq(boardTasks.pileId, pileId), isNull(boardTasks.deletedAt)))
    .limit(1);
  if (countRow) {
    return NextResponse.json(
      { error: "Pile is not empty. Move its cards first." },
      { status: 409 },
    );
  }

  await db
    .update(boardPiles)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(boardPiles.id, pileId));

  publishBoard(guard.boardId, { type: "pile_deleted", pileId });

  return NextResponse.json({ ok: true });
}
