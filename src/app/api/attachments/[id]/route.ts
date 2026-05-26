import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskAttachments } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireAttachmentCap } from "@/lib/workspace-access";
import { getStorage } from "@/lib/storage";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const attachmentId = Number(id);
  const guard = await requireAttachmentCap(attachmentId, auth.session.sub, "edit_card");
  if (!guard.ok) return guard.response;
  const attachment = guard.attachment;

  await db
    .update(boardTaskAttachments)
    .set({ deletedAt: new Date() })
    .where(eq(boardTaskAttachments.id, attachmentId));

  // Best-effort delete from object storage.
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
