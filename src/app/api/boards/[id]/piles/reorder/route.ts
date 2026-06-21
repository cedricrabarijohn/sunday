import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardPiles } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireBoardCap } from "@/lib/workspace-access";
import { publishBoard } from "@/lib/board-bus";

/**
 * Reorder a board's piles. The body carries the full ordered list of pile ids;
 * positions are rewritten to 1..N to match. We require the submitted set to be
 * exactly the board's current (non-deleted) piles so a stale client can't drop
 * or duplicate a column.
 */
export async function PUT(
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
  const pileIds: unknown = body?.pileIds;
  if (
    !Array.isArray(pileIds) ||
    pileIds.some((x) => !Number.isInteger(x))
  ) {
    return NextResponse.json({ error: "pileIds must be an array of ids" }, { status: 400 });
  }
  const ordered = pileIds as number[];

  const existing = await db
    .select({ id: boardPiles.id })
    .from(boardPiles)
    .where(and(eq(boardPiles.boardId, boardId), isNull(boardPiles.deletedAt)));

  const existingIds = new Set(existing.map((r) => r.id));
  const submitted = new Set(ordered);
  if (
    existingIds.size !== submitted.size ||
    ordered.length !== existingIds.size ||
    ![...existingIds].every((pid) => submitted.has(pid))
  ) {
    return NextResponse.json(
      { error: "pileIds must list exactly the board's piles" },
      { status: 409 },
    );
  }

  const now = new Date();
  await Promise.all(
    ordered.map((pid, index) =>
      db
        .update(boardPiles)
        .set({ position: index + 1, updatedAt: now })
        .where(and(eq(boardPiles.id, pid), eq(boardPiles.boardId, boardId))),
    ),
  );

  publishBoard(boardId, { type: "piles_reordered", pileIds: ordered });

  return NextResponse.json({ ok: true });
}
