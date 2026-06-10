import crypto from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { authTokens } from "@/db/schema";

export type TokenPurpose = "password_reset" | "email_verify";

/** Create a single-use, time-limited token for the given user + purpose. */
export async function createAuthToken(
  userId: number,
  purpose: TokenPurpose,
  ttlMs: number,
): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  const now = new Date();
  await db.insert(authTokens).values({
    userId,
    purpose,
    token,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
  });
  return token;
}

/**
 * Validate + burn a token. Returns the userId if it matches the purpose, is
 * unused and unexpired (and marks it used); otherwise null.
 */
export async function consumeAuthToken(
  token: string,
  purpose: TokenPurpose,
): Promise<number | null> {
  if (!token) return null;
  const now = new Date();
  const [row] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.token, token),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
      ),
    )
    .limit(1);
  if (!row || !row.expiresAt || row.expiresAt < now) return null;
  await db.update(authTokens).set({ usedAt: now }).where(eq(authTokens.id, row.id));
  return row.userId;
}
