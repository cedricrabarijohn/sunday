import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardPiles,
  boardTaskAssignees,
  boardTaskAttachments,
  boardTaskItems,
  boardTaskLabels,
  boardTasks,
  boards,
} from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { getStorage } from "@/lib/storage";
import { requireBoardCap } from "@/lib/workspace-access";

/**
 * Backwards-compat re-export. New code should call requireBoardCap from
 * "@/lib/workspace-access" directly.
 */
export async function loadBoardForUser(boardId: number, userId: number) {
  const guard = await requireBoardCap(boardId, userId, "view_board");
  if (!guard.ok) return null;
  return {
    id: guard.board.id,
    workspaceId: guard.board.workspaceId,
    title: guard.board.title,
    createdAt: guard.board.createdAt,
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;
  return NextResponse.json({ board: guard.board });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "edit_board");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const updates: Partial<{ title: string }> = {};
  if (typeof body?.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    if (t.length > 100) return NextResponse.json({ error: "title too long" }, { status: 400 });
    updates.title = t;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  await db.update(boards).set(updates).where(eq(boards.id, boardId));
  return NextResponse.json({ ok: true });
}

/**
 * Boards are hard-deleted with their dependents (piles, cards,
 * sub-tasks, attachments, label assignments). Every other entity in
 * the system still uses soft-delete so individual deletes stay safe
 * to undo, but a board is treated as a container: dropping it should
 * drop everything inside.
 *
 * Storage objects are deleted after the database transaction commits.
 * A failed storage delete only leaks bytes, never breaks the DB.
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "delete_board");
  if (!guard.ok) return guard.response;

  // Collect everything we need before the destructive part.
  const taskRows = await db
    .select({ id: boardTasks.id })
    .from(boardTasks)
    .where(eq(boardTasks.boardId, boardId));
  const taskIds = taskRows.map((t) => t.id);

  const attachments = taskIds.length
    ? await db
        .select({
          id: boardTaskAttachments.id,
          storageKey: boardTaskAttachments.storageKey,
          url: boardTaskAttachments.url,
        })
        .from(boardTaskAttachments)
        .where(inArray(boardTaskAttachments.boardTaskId, taskIds))
    : [];

  await db.transaction(async (tx) => {
    if (taskIds.length) {
      await tx
        .delete(boardTaskAttachments)
        .where(inArray(boardTaskAttachments.boardTaskId, taskIds));
      await tx
        .delete(boardTaskItems)
        .where(inArray(boardTaskItems.boardTaskId, taskIds));
      await tx
        .delete(boardTaskLabels)
        .where(inArray(boardTaskLabels.boardTaskId, taskIds));
      await tx
        .delete(boardTaskAssignees)
        .where(inArray(boardTaskAssignees.boardTaskId, taskIds));
    }
    await tx.delete(boardTasks).where(eq(boardTasks.boardId, boardId));
    await tx.delete(boardPiles).where(eq(boardPiles.boardId, boardId));
    await tx.delete(boards).where(eq(boards.id, boardId));
  });

  // Fire-and-forget storage cleanup. Even if every delete fails, the DB is
  // already consistent. Best-effort: log and move on.
  if (attachments.length) {
    const storage = getStorage();
    void Promise.allSettled(
      attachments.map((a) => {
        let key = a.storageKey ?? null;
        if (!key && a.url && a.url.startsWith("/uploads/")) {
          key = a.url.replace(/^\/+/, "");
        }
        return key ? storage.delete(key) : Promise.resolve();
      }),
    );
  }

  return NextResponse.json({ ok: true });
}
