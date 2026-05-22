import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskAttachments, boardTasks, boards, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { getStorage } from "@/lib/storage";

async function loadAttachmentForUser(attachmentId: number, userId: number) {
  const [row] = await db
    .select({
      id: boardTaskAttachments.id,
      url: boardTaskAttachments.url,
      storageKey: boardTaskAttachments.storageKey,
      boardTaskId: boardTaskAttachments.boardTaskId,
    })
    .from(boardTaskAttachments)
    .innerJoin(boardTasks, eq(boardTasks.id, boardTaskAttachments.boardTaskId))
    .innerJoin(boards, eq(boards.id, boardTasks.boardId))
    .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, boards.workspaceId))
    .where(
      and(
        eq(boardTaskAttachments.id, attachmentId),
        eq(workspaceUsers.userId, userId),
        isNull(boardTaskAttachments.deletedAt),
        isNull(boardTasks.deletedAt),
        isNull(boards.deletedAt),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const attachmentId = Number(id);
  if (!Number.isFinite(attachmentId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const attachment = await loadAttachmentForUser(attachmentId, auth.session.sub);
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(boardTaskAttachments)
    .set({ deletedAt: new Date() })
    .where(eq(boardTaskAttachments.id, attachmentId));

  // Best-effort delete from object storage.
  // Prefer the stable storage_key; fall back to deriving a key from
  // legacy local-disk URLs (/uploads/...) for rows uploaded before the
  // abstraction was added.
  let key = attachment.storageKey ?? null;
  if (!key && attachment.url && attachment.url.startsWith("/uploads/")) {
    key = attachment.url.replace(/^\/+/, "");
  }
  if (key) {
    getStorage()
      .delete(key)
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
