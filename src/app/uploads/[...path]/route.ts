import { promises as fs } from "fs";
import path from "path";
import type { NextRequest } from "next/server";

/**
 * Serves locally-stored attachments (STORAGE_DRIVER=local) from disk.
 *
 * Next.js only serves files that were in `public/` at BUILD time — files the
 * app writes at runtime are not picked up by `next start`, so a plain static
 * URL 404s in production. This route reads them from disk per request instead,
 * which works identically in dev and prod.
 */
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;

  // Reject anything that could escape the uploads directory.
  if (!parts?.length || parts.some((p) => !p || p === ".." || p.includes("\\"))) {
    return new Response("Not found", { status: 404 });
  }

  const baseDir = path.join(process.cwd(), "public", "uploads");
  const filePath = path.resolve(baseDir, ...parts);
  if (filePath !== baseDir && !filePath.startsWith(baseDir + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = (parts[parts.length - 1].split(".").pop() || "").toLowerCase();
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        // Filenames are random UUIDs, so the content never changes.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
