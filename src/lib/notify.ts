import { db } from "@/db/client";
import { notifications } from "@/db/schema";

export type NotificationType =
  | "card_assigned"
  | "card_comment";

export type NewNotification = {
  userId: number;
  type: NotificationType;
  actorUserId: number | null;
  cardId?: number | null;
  boardId?: number | null;
  workspaceId?: number | null;
  payload?: Record<string, unknown> | null;
};

/**
 * Fan-out notification creator. Skips rows where userId === actorUserId
 * so we never tell someone "you assigned yourself" or "you commented on
 * your own card".
 */
export async function emitNotifications(rows: NewNotification[]): Promise<void> {
  const now = new Date();
  const filtered = rows.filter((r) => r.userId !== r.actorUserId);
  if (filtered.length === 0) return;
  await db.insert(notifications).values(
    filtered.map((r) => ({
      userId: r.userId,
      type: r.type,
      actorUserId: r.actorUserId,
      cardId: r.cardId ?? null,
      boardId: r.boardId ?? null,
      workspaceId: r.workspaceId ?? null,
      payload: r.payload ?? null,
      createdAt: now,
    })),
  );
}
