import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Storage, PutInput, PutResult } from "./types";

export type S3Config = {
  /** Required. Bucket name. */
  bucket: string;
  /** Required. Region (use any value for MinIO, e.g. "us-east-1"). */
  region: string;
  /** Optional. Custom endpoint URL (set for MinIO or Cloudflare R2). */
  endpoint?: string;
  /** When using path-style addressing (MinIO defaults to path-style). */
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Base URL the browser will use to GET objects. Independent from the
   * SDK endpoint, since the browser may need a different hostname
   * (e.g. localhost while the server uses the docker network name).
   *
   * Pattern: "<scheme>://<host[:port]>" — bucket and key are appended.
   */
  publicBaseUrl: string;
};

export class S3Storage implements Storage {
  readonly driver = "s3";
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put({ key, buffer, mimeType }: PutInput): Promise<PutResult> {
    const cleanKey = key.replace(/^\/+/, "");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: cleanKey,
        Body: buffer,
        ContentType: mimeType,
        // The bucket policy controls public access; we don't set ACLs
        // because many S3-compatible services reject ACL on policy-managed
        // buckets (and MinIO with the "download" policy already exposes it).
      }),
    );
    const base = this.config.publicBaseUrl.replace(/\/+$/, "");
    return {
      key: cleanKey,
      url: `${base}/${this.config.bucket}/${cleanKey}`,
    };
  }

  async delete(key: string): Promise<void> {
    if (!key) return;
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: key.replace(/^\/+/, ""),
        }),
      );
    } catch (err) {
      console.warn("[storage:s3] delete failed", key, err);
    }
  }
}
