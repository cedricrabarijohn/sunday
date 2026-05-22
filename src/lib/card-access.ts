import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTasks, boards, workspaceUsers } from "@/db/schema";

export async function loadCardForUser(cardId: number, userId: number) {
  const [row] = await db
    .select({
      id: boardTasks.id,
      title: boardTasks.title,
      description: boardTasks.description,
      position: boardTasks.position,
      boardId: boardTasks.boardId,
    })
    .from(boardTasks)
    .innerJoin(boards, eq(boards.id, boardTasks.boardId))
    .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, boards.workspaceId))
    .where(
      and(
        eq(boardTasks.id, cardId),
        eq(workspaceUsers.userId, userId),
        isNull(boardTasks.deletedAt),
        isNull(boards.deletedAt),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
