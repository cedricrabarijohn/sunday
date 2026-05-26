import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db/client";
import { boardTaskAttachments } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";
import { getStorage } from "@/lib/storage";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const EXT_FOR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cardId = Number(id);
  const guard = await requireCardCap(cardId, auth.session.sub, "edit_card");
  if (!guard.ok) return guard.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field is required" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
  }

  const ext = EXT_FOR_MIME[file.type] ?? "bin";
  const name = `${crypto.randomUUID()}.${ext}`;
  const key = `uploads/${cardId}/${name}`;
  const buf = Buffer.from(await file.arrayBuffer());

  let put: { url: string; key: string };
  try {
    put = await getStorage().put({ key, buffer: buf, mimeType: file.type });
  } catch (err) {
    console.error("[attachments] upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const original = (file.name || "image").slice(0, 255);

  const [result] = await db.insert(boardTaskAttachments).values({
    boardTaskId: cardId,
    filename: original,
    mimeType: file.type,
    sizeBytes: file.size,
    url: put.url,
    storageKey: put.key,
    createdAt: new Date(),
  });
  const attachmentId = Number((result as { insertId: number }).insertId);

  return NextResponse.json(
    {
      attachment: {
        id: attachmentId,
        filename: original,
        mimeType: file.type,
        sizeBytes: file.size,
        url: put.url,
      },
    },
    { status: 201 },
  );
}
