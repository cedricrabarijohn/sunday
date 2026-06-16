import crypto from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { apiTokens } from "@/db/schema";

/**
 * Personal access tokens for programmatic access (the MCP server, and any
 * future API client). Tokens are long-lived and reusable. We only ever store
 * the SHA-256 hash; the plaintext is returned once at creation and never again.
 *
 * Format: `sun_pat_<43 base64url chars>` (32 random bytes). The `sun_pat_`
 * prefix makes leaked tokens easy to detect with secret scanners.
 */
const TOKEN_PREFIX = "sun_pat_";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export type CreatedToken = {
  id: number;
  name: string;
  /** Plaintext — show once, never stored. */
  token: string;
  prefix: string;
};

/** Mint a new token for the user. `ttlMs` null/undefined = never expires. */
export async function createApiToken(
  userId: number,
  name: string,
  ttlMs?: number | null,
): Promise<CreatedToken> {
  const raw = TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  // Stored for display in the UI ("sun_pat_AbC…"): enough to recognise, not
  // enough to use.
  const prefix = raw.slice(0, 12);
  const [res] = await db.insert(apiTokens).values({
    userId,
    name: name.slice(0, 60),
    tokenHash: hashToken(raw),
    tokenPrefix: prefix,
    createdAt: now,
    expiresAt: ttlMs ? new Date(now.getTime() + ttlMs) : null,
  });
  return { id: res.insertId, name, token: raw, prefix };
}

/**
 * Resolve a bearer token to its owner. Returns the userId on success and
 * bumps `last_used_at`; returns null if unknown, revoked or expired.
 */
export async function verifyApiToken(raw: string): Promise<number | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      expiresAt: apiTokens.expiresAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hashToken(raw)), isNull(apiTokens.revokedAt)))
    .limit(1);
  if (!row) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;
  // Best-effort usage stamp; never block auth on it.
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {});
  return row.userId;
}

export type ApiTokenSummary = {
  id: number;
  name: string;
  prefix: string;
  createdAt: Date | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
};

/** List a user's active (non-revoked) tokens, newest first. */
export async function listApiTokens(userId: number): Promise<ApiTokenSummary[]> {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.tokenPrefix,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.id));
}

/** Revoke one of the user's tokens. Returns true if a row was affected. */
export async function revokeApiToken(userId: number, id: number): Promise<boolean> {
  const [res] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(apiTokens.id, id), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)),
    );
  return res.affectedRows > 0;
}
