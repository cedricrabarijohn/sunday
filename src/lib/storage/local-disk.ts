import { promises as fs } from "fs";
import path from "path";
import { Storage, PutInput, PutResult } from "./types";

/**
 * Local-disk storage for dev. Writes under `public/uploads/` so the
 * Next.js static server picks them up.
 *
 * NOT suitable for production: the container filesystem is ephemeral
 * and writes after `next build` are not part of the immutable image.
 * Use the S3 driver against MinIO / S3 / R2 / Spaces in prod.
 */
export class LocalDiskStorage implements Storage {
  readonly driver = "local-disk";

  private readonly publicDir = path.join(process.cwd(), "public");

  async put({ key, buffer }: PutInput): Promise<PutResult> {
    const safe = key.replace(/^\/+/, "");
    const filePath = path.join(this.publicDir, safe);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return {
      key: safe,
      url: "/" + safe,
    };
  }

  async delete(key: string): Promise<void> {
    if (!key) return;
    const safe = key.replace(/^\/+/, "");
    const filePath = path.join(this.publicDir, safe);
    try {
      await fs.unlink(filePath);
    } catch {
      // best effort
    }
  }
}
