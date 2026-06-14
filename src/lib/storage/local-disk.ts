import { promises as fs } from "fs";
import path from "path";
import { Storage, PutInput, PutResult } from "./types";

/**
 * Local-disk storage (the default). Writes under `public/uploads/` so the
 * Next.js server serves them directly — no object store required, which is
 * what most self-hosted single-instance deployments want.
 *
 * Persistence: keep `public/uploads/` on a persistent volume (the Compose
 * setup bind-mounts the project dir, so uploads survive restarts). Switch to
 * the S3 driver (MinIO / S3 / R2 / Spaces) only when you run multiple app
 * instances or want storage off the app host.
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
