import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardPiles, boards, workspaceUsers } from "@/db/schema";

export async function loadPileForUser(pileId: number, userId: number) {
  const [row] = await db
    .select({
      id: boardPiles.id,
      boardId: boardPiles.boardId,
      title: boardPiles.title,
      color: boardPiles.color,
      position: boardPiles.position,
    })
    .from(boardPiles)
    .innerJoin(boards, eq(boards.id, boardPiles.boardId))
    .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, boards.workspaceId))
    .where(
      and(
        eq(boardPiles.id, pileId),
        eq(workspaceUsers.userId, userId),
        isNull(boardPiles.deletedAt),
        isNull(boards.deletedAt),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
