/**
 * Tiny abstraction over object storage. Implementations only need to
 * be able to put a buffer at a key and delete it later.
 *
 * Keys are slash-separated and stable. They are stored in the DB so
 * deletion does not depend on a URL that may rotate (e.g. CDN, signed).
 *
 * The returned `url` is what the browser uses to fetch the asset.
 * It is also stored in the DB for backward-compat with existing rows
 * that pre-date the storage_key column.
 */
export interface PutInput {
  key: string;
  buffer: Buffer;
  mimeType: string;
}

export interface PutResult {
  /** Public, browser-resolvable URL of the stored object. */
  url: string;
  /** Stable storage key, used for later deletion. */
  key: string;
}

export interface Storage {
  /**
   * Driver name used in telemetry / errors. Not load-bearing.
   */
  readonly driver: string;

  /**
   * Upload a buffer. The implementation may choose to ignore `key` and
   * generate its own (e.g. for S3 with content-addressing), but the
   * caller will trust the returned `key` for future deletes.
   */
  put(input: PutInput): Promise<PutResult>;

  /**
   * Remove a previously-uploaded object. Best-effort: failures are
   * logged but should not raise.
   */
  delete(key: string): Promise<void>;
}
