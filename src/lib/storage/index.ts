import { Storage } from "./types";
import { LocalDiskStorage } from "./local-disk";
import { S3Storage } from "./s3";

export type { Storage, PutInput, PutResult } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __sundayStorage__: Storage | undefined;
}

function build(): Storage {
  const driver = (process.env.STORAGE_DRIVER || "local").toLowerCase();

  if (driver === "s3") {
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || "us-east-1";
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;
    const forcePathStyle = (process.env.S3_FORCE_PATH_STYLE ?? "true") !== "false";

    if (!bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
      throw new Error(
        "[storage] STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL",
      );
    }

    return new S3Storage({
      bucket,
      region,
      endpoint,
      accessKeyId,
      secretAccessKey,
      publicBaseUrl,
      forcePathStyle,
    });
  }

  return new LocalDiskStorage();
}

/**
 * Returns the process-wide Storage instance, building it on first use.
 * Cached on globalThis to survive Next.js hot reloads in dev.
 */
export function getStorage(): Storage {
  if (!global.__sundayStorage__) {
    global.__sundayStorage__ = build();
  }
  return global.__sundayStorage__;
}
