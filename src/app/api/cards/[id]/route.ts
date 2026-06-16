import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardTaskAssignees,
  boardTaskAttachments,
  boardTaskComments,
  boardTaskItems,
  boardTaskLabels,
  boardTaskReactions,
  cardLinks,
  labels,
  users,
} from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { loadCapabilities, requireCardCap } from "@/lib/workspace-access";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cardId = Number(id);
  const guard = await requireCardCap(cardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const items = await db
    .select({
      id: boardTaskItems.id,
      title: boardTaskItems.title,
      done: boardTaskItems.done,
      position: boardTaskItems.position,
    })
    .from(boardTaskItems)
    .where(and(eq(boardTaskItems.boardTaskId, cardId), isNull(boardTaskItems.deletedAt)))
    .orderBy(asc(boardTaskItems.position), asc(boardTaskItems.id));

  const attachments = await db
    .select({
      id: boardTaskAttachments.id,
      filename: boardTaskAttachments.filename,
      mimeType: boardTaskAttachments.mimeType,
      sizeBytes: boardTaskAttachments.sizeBytes,
      url: boardTaskAttachments.url,
      createdAt: boardTaskAttachments.createdAt,
    })
    .from(boardTaskAttachments)
    .where(
      and(
        eq(boardTaskAttachments.boardTaskId, cardId),
        isNull(boardTaskAttachments.deletedAt),
      ),
    )
    .orderBy(asc(boardTaskAttachments.id));

  const cardLabels = await db
    .select({
      id: labels.id,
      title: labels.title,
      color: labels.color,
      position: labels.position,
    })
    .from(boardTaskLabels)
    .innerJoin(labels, eq(labels.id, boardTaskLabels.labelId))
    .where(and(eq(boardTaskLabels.boardTaskId, cardId), isNull(labels.deletedAt)))
    .orderBy(asc(labels.position), asc(labels.id));

  const assignees = await db
    .select({
      userId: users.id,
      firstname: users.firstname,
      lastname: users.lastname,
      email: users.email,
    })
    .from(boardTaskAssignees)
    .innerJoin(users, eq(users.id, boardTaskAssignees.userId))
    .where(eq(boardTaskAssignees.boardTaskId, cardId))
    .orderBy(asc(users.firstname), asc(users.id));

  const comments = await db
    .select({
      id: boardTaskComments.id,
      body: boardTaskComments.body,
      createdAt: boardTaskComments.createdAt,
      updatedAt: boardTaskComments.updatedAt,
      userId: users.id,
      firstname: users.firstname,
      lastname: users.lastname,
      email: users.email,
    })
    .from(boardTaskComments)
    .innerJoin(users, eq(users.id, boardTaskComments.userId))
    .where(
      and(
        eq(boardTaskComments.boardTaskId, cardId),
        isNull(boardTaskComments.deletedAt),
      ),
    )
    .orderBy(asc(boardTaskComments.createdAt), asc(boardTaskComments.id));

  // Reactions on the task description and on its comments
  const commentIds = comments.map((c) => c.id);
  const rawReactions = await db
    .select({
      kind: boardTaskReactions.kind,
      targetId: boardTaskReactions.targetId,
      userId: boardTaskReactions.userId,
      emoji: boardTaskReactions.emoji,
    })
    .from(boardTaskReactions)
    .where(
      commentIds.length > 0
        ? inArray(boardTaskReactions.kind, ["task", "comment"])
        : eq(boardTaskReactions.kind, "task"),
    )
    .then((rows) =>
      rows.filter(
        (r) =>
          (r.kind === "task" && r.targetId === cardId) ||
          (r.kind === "comment" && commentIds.includes(r.targetId)),
      ),
    );

  function groupReactions(rows: typeof rawReactions) {
    const map = new Map<string, number[]>();
    for (const r of rows) {
      if (!map.has(r.emoji)) map.set(r.emoji, []);
      map.get(r.emoji)!.push(r.userId);
    }
    return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
  }

  const taskReactions = groupReactions(rawReactions.filter((r) => r.kind === "task"));
  const commentReactionsByCommentId = new Map<number, { emoji: string; userIds: number[] }[]>();
  for (const c of comments) {
    commentReactionsByCommentId.set(
      c.id,
      groupReactions(rawReactions.filter((r) => r.kind === "comment" && r.targetId === c.id)),
    );
  }

  // Linked commits / PRs (SCM integration). Empty unless the workspace has
  // connected Gitea and a webhook linked something to this card.
  const links = await db
    .select({
      id: cardLinks.id,
      kind: cardLinks.kind,
      ref: cardLinks.ref,
      title: cardLinks.title,
      url: cardLinks.url,
      state: cardLinks.state,
    })
    .from(cardLinks)
    .where(eq(cardLinks.cardId, cardId))
    .orderBy(asc(cardLinks.id));

  // Managing the workspace label catalog (create/edit/delete) is a
  // workspace-scoped capability, distinct from the board caps above.
  const wsCaps = await loadCapabilities(guard.workspaceId, auth.session.sub);

  return NextResponse.json({
    card: guard.card,
    items,
    attachments,
    labels: cardLabels,
    assignees,
    comments: comments.map((c) => ({
      ...c,
      reactions: commentReactionsByCommentId.get(c.id) ?? [],
    })),
    links,
    taskReactions,
    capabilities: Array.from(guard.capabilities),
    canManageLabels: wsCaps.has("manage_labels"),
    currentUserId: auth.session.sub,
  });
}
