import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskAttachments, boardTasks, boards, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";

async function loadAttachmentForUser(attachmentId: number, userId: number) {
  const [row] = await db
    .select({
      id: boardTaskAttachments.id,
      url: boardTaskAttachments.url,
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

  // Best-effort cleanup of the file on disk; ignore failures.
  if (attachment.url && attachment.url.startsWith("/uploads/")) {
    const onDisk = path.join(process.cwd(), "public", attachment.url.slice(1));
    fs.unlink(onDisk).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
