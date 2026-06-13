import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardTaskAttachments,
  boardTaskComments,
  boardTaskItems,
  cardLinks,
} from "@/db/schema";
import { publishBoard } from "@/lib/board-bus";

/**
 * Recompute a card's badge counts (checklist, attachments, comments)
 * and broadcast them to every open board view. The same soft-delete
 * filters as the board page's initial load, so the live numbers match
 * a fresh fetch. Counts are authoritative, so an originating client
 * re-applying its own echo is a no-op.
 */
export async function publishCardCounts(
  boardId: number,
  cardId: number,
): Promise<void> {
  const [itemRow] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      done: sql<number>`SUM(CASE WHEN ${boardTaskItems.done} = 1 THEN 1 ELSE 0 END)`,
    })
    .from(boardTaskItems)
    .where(
      and(eq(boardTaskItems.boardTaskId, cardId), isNull(boardTaskItems.deletedAt)),
    );

  const [attachmentRow] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(boardTaskAttachments)
    .where(
      and(
        eq(boardTaskAttachments.boardTaskId, cardId),
        isNull(boardTaskAttachments.deletedAt),
      ),
    );

  const [commentRow] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(boardTaskComments)
    .where(
      and(
        eq(boardTaskComments.boardTaskId, cardId),
        isNull(boardTaskComments.deletedAt),
      ),
    );

  const [linkRow] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(cardLinks)
    .where(eq(cardLinks.cardId, cardId));

  publishBoard(boardId, {
    type: "card_counts",
    cardId,
    itemsTotal: Number(itemRow?.total ?? 0),
    itemsDone: Number(itemRow?.done ?? 0),
    attachments: Number(attachmentRow?.total ?? 0),
    comments: Number(commentRow?.total ?? 0),
    links: Number(linkRow?.total ?? 0),
  });
}
