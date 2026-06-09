import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTasks, boards, notifications, users } from "@/db/schema";
import { appUrl, sendMail } from "@/lib/mail";
import { notificationEmail } from "@/lib/mail-templates";

export type NotificationType =
  | "card_assigned"
  | "card_comment"
  | "card_mention";

export type NewNotification = {
  userId: number;
  type: NotificationType;
  actorUserId: number | null;
  cardId?: number | null;
  boardId?: number | null;
  workspaceId?: number | null;
  payload?: Record<string, unknown> | null;
};

const ACTION: Record<NotificationType, string> = {
  card_assigned: "assigned you to",
  card_comment: "commented on",
  card_mention: "mentioned you on",
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

  // Email the same people, in the background — the persistent server lets us
  // fire-and-forget so the mutation that triggered this doesn't wait on SMTP.
  void emailNotifications(filtered);
}

function nameOf(u?: { firstname: string | null; lastname: string | null; email: string | null }): string {
  if (!u) return "Someone";
  return [u.firstname, u.lastname].filter(Boolean).join(" ") || u.email || "Someone";
}

async function emailNotifications(rows: NewNotification[]): Promise<void> {
  try {
    const userIds = [
      ...new Set(
        rows.flatMap((r) => [r.userId, r.actorUserId]).filter((x): x is number => x != null),
      ),
    ];
    const cardIds = [...new Set(rows.map((r) => r.cardId).filter((x): x is number => x != null))];

    const userRows = userIds.length
      ? await db
          .select({ id: users.id, firstname: users.firstname, lastname: users.lastname, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
    const userById = new Map(userRows.map((u) => [u.id, u]));

    const cardRows = cardIds.length
      ? await db
          .select({ id: boardTasks.id, title: boardTasks.title, boardId: boardTasks.boardId })
          .from(boardTasks)
          .where(inArray(boardTasks.id, cardIds))
      : [];
    const cardById = new Map(cardRows.map((c) => [c.id, c]));

    const boardIds = [
      ...new Set(cardRows.map((c) => c.boardId).filter((x): x is number => x != null)),
    ];
    const boardRows = boardIds.length
      ? await db
          .select({ id: boards.id, title: boards.title })
          .from(boards)
          .where(inArray(boards.id, boardIds))
      : [];
    const boardById = new Map(boardRows.map((b) => [b.id, b]));

    await Promise.all(
      rows.map(async (r) => {
        const recipient = userById.get(r.userId);
        if (!recipient?.email) return;
        const card = r.cardId != null ? cardById.get(r.cardId) : undefined;
        const board = card?.boardId != null ? boardById.get(card.boardId) : undefined;
        const boardId = card?.boardId ?? r.boardId ?? null;
        const cardUrl =
          boardId != null && r.cardId != null
            ? `${appUrl()}/boards/${boardId}?card=${r.cardId}`
            : appUrl();
        const preview = typeof r.payload?.preview === "string" ? r.payload.preview : undefined;
        const { subject, html } = notificationEmail({
          actorName: nameOf(userById.get(r.actorUserId ?? -1)),
          action: ACTION[r.type],
          cardTitle: card?.title || "a card",
          boardName: board?.title || "a board",
          preview,
          cardUrl,
        });
        await sendMail({ to: recipient.email, subject, html });
      }),
    );
  } catch (err) {
    console.error("[mail] notification emails failed:", err);
  }
}
