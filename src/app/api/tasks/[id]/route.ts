import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardPiles, boardTasks } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";

async function repackPile(pileId: number) {
  const rows = await db
    .select({ id: boardTasks.id })
    .from(boardTasks)
    .where(and(eq(boardTasks.pileId, pileId), isNull(boardTasks.deletedAt)))
    .orderBy(asc(boardTasks.position), asc(boardTasks.id));
  for (let i = 0; i < rows.length; i++) {
    await db
      .update(boardTasks)
      .set({ position: i + 1 })
      .where(eq(boardTasks.id, rows[i].id));
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const taskId = Number(id);
  const guard = await requireCardCap(taskId, auth.session.sub, "edit_card");
  if (!guard.ok) return guard.response;
  const task = guard.card;

  const body = await request.json().catch(() => null);

  const updates: Partial<{
    title: string;
    description: string | null;
    dueAt: Date | null;
  }> = {};
  if (typeof body?.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    if (t.length > 255) return NextResponse.json({ error: "title too long" }, { status: 400 });
    updates.title = t;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "dueAt")) {
    if (body.dueAt === null || body.dueAt === "") {
      updates.dueAt = null;
    } else if (typeof body.dueAt === "string") {
      const d = new Date(body.dueAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid dueAt" }, { status: 400 });
      }
      updates.dueAt = d;
    } else {
      return NextResponse.json({ error: "dueAt must be a date string or null" }, { status: 400 });
    }
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "description")) {
    if (body.description === null || body.description === "") {
      updates.description = null;
    } else if (typeof body.description === "string") {
      // Plain text only. Hard cap so a runaway paste cannot blow up the column.
      if (body.description.length > 20000) {
        return NextResponse.json({ error: "description too long" }, { status: 400 });
      }
      updates.description = body.description;
    } else {
      return NextResponse.json({ error: "description must be a string" }, { status: 400 });
    }
  }

  // Move (pileId + optional afterCardId)
  const wantsMove =
    body && (typeof body.pileId === "number" || body.pileId === null ||
      Object.prototype.hasOwnProperty.call(body, "afterCardId"));

  if (wantsMove) {
    const targetPileId = typeof body.pileId === "number" ? body.pileId : task.pileId;
    if (typeof targetPileId !== "number") {
      return NextResponse.json({ error: "Card has no pile" }, { status: 400 });
    }

    // Confirm target pile is in the same board as the card
    const [pile] = await db
      .select({ id: boardPiles.id, boardId: boardPiles.boardId })
      .from(boardPiles)
      .where(and(eq(boardPiles.id, targetPileId), isNull(boardPiles.deletedAt)))
      .limit(1);
    if (!pile || pile.boardId !== task.boardId) {
      return NextResponse.json({ error: "Invalid target pile" }, { status: 400 });
    }

    const afterCardId =
      body.afterCardId === null || body.afterCardId === undefined
        ? null
        : Number(body.afterCardId);

    // Read the target pile's current cards (excluding the moved card)
    const others = await db
      .select({ id: boardTasks.id, position: boardTasks.position })
      .from(boardTasks)
      .where(
        and(
          eq(boardTasks.pileId, targetPileId),
          isNull(boardTasks.deletedAt),
        ),
      )
      .orderBy(asc(boardTasks.position), asc(boardTasks.id));
    const filtered = others.filter((c) => c.id !== taskId);

    let insertAt = filtered.length;
    if (afterCardId === null) {
      insertAt = 0;
    } else {
      const idx = filtered.findIndex((c) => c.id === afterCardId);
      insertAt = idx === -1 ? filtered.length : idx + 1;
    }
    const newOrder = [
      ...filtered.slice(0, insertAt),
      { id: taskId, position: 0 },
      ...filtered.slice(insertAt),
    ];

    const sourcePileId = task.pileId ?? null;
    const now = new Date();

    // First, update the moved card's pile so subsequent reads include it.
    await db
      .update(boardTasks)
      .set({
        ...updates,
        pileId: targetPileId,
        updatedAt: now,
      })
      .where(eq(boardTasks.id, taskId));

    // Re-pack target pile with the desired order.
    for (let i = 0; i < newOrder.length; i++) {
      await db
        .update(boardTasks)
        .set({ position: i + 1 })
        .where(eq(boardTasks.id, newOrder[i].id));
    }

    // Re-pack source pile when moving across piles.
    if (sourcePileId !== null && sourcePileId !== targetPileId) {
      await repackPile(sourcePileId);
    }

    return NextResponse.json({ ok: true, pileId: targetPileId });
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
  const guard = await requireCardCap(taskId, auth.session.sub, "delete_card");
  if (!guard.ok) return guard.response;
  const task = guard.card;

  await db
    .update(boardTasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(boardTasks.id, taskId));

  if (task.pileId !== null && task.pileId !== undefined) {
    await repackPile(task.pileId);
  }

  return NextResponse.json({ ok: true });
}
