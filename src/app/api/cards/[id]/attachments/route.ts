import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "@/db/client";
import { boardTaskAttachments } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { loadCardForUser } from "@/lib/card-access";

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
  if (!Number.isFinite(cardId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const card = await loadCardForUser(cardId, auth.session.sub);
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
  const dir = path.join(process.cwd(), "public", "uploads", String(cardId));
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, name);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buf);

  const url = `/uploads/${cardId}/${name}`;
  const original = (file.name || "image").slice(0, 255);

  const [result] = await db.insert(boardTaskAttachments).values({
    boardTaskId: cardId,
    filename: original,
    mimeType: file.type,
    sizeBytes: file.size,
    url,
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
        url,
      },
    },
    { status: 201 },
  );
}
