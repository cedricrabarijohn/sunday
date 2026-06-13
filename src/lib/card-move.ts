import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardPiles, boardTasks } from "@/db/schema";
import { publishBoard } from "@/lib/board-bus";

/** Re-pack a pile's positions and return its resulting card order. */
async function repackPile(pileId: number): Promise<number[]> {
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
  return rows.map((r) => r.id);
}

/**
 * Move a card to the top of the pile named `pileName` in its own board
 * (case-insensitive match), then re-pack both piles and broadcast the move
 * over the board bus so open views update live. No-ops — returning false —
 * when the board has no such pile or the card is already there. Used by the
 * SCM webhook to advance a card when its pull request merges.
 */
export async function moveCardToPileByName(
  card: { id: number; boardId: number; pileId: number | null },
  pileName: string,
): Promise<boolean> {
  const target = pileName.trim().toLowerCase();
  if (!target) return false;

  const piles = await db
    .select({ id: boardPiles.id, title: boardPiles.title })
    .from(boardPiles)
    .where(and(eq(boardPiles.boardId, card.boardId), isNull(boardPiles.deletedAt)));
  const dest = piles.find((p) => (p.title ?? "").trim().toLowerCase() === target);
  if (!dest || dest.id === card.pileId) return false;

  const others = await db
    .select({ id: boardTasks.id })
    .from(boardTasks)
    .where(and(eq(boardTasks.pileId, dest.id), isNull(boardTasks.deletedAt)))
    .orderBy(asc(boardTasks.position), asc(boardTasks.id));
  const newOrder = [card.id, ...others.map((c) => c.id).filter((id) => id !== card.id)];

  const now = new Date();
  await db
    .update(boardTasks)
    .set({ pileId: dest.id, updatedAt: now })
    .where(eq(boardTasks.id, card.id));
  for (let i = 0; i < newOrder.length; i++) {
    await db
      .update(boardTasks)
      .set({ position: i + 1 })
      .where(eq(boardTasks.id, newOrder[i]));
  }

  const order = [{ pileId: dest.id, cardIds: newOrder }];
  if (card.pileId !== null && card.pileId !== dest.id) {
    order.push({ pileId: card.pileId, cardIds: await repackPile(card.pileId) });
  }

  publishBoard(card.boardId, { type: "card_moved", cardId: card.id, pileId: dest.id, order });
  return true;
}
