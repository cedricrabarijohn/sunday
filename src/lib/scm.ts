import crypto from "crypto";

/** Verify a Gitea webhook payload against the connection secret (HMAC-SHA256). */
export function verifyGiteaSignature(
  rawBody: string,
  signature: string | null,
  secret: string | null,
): boolean {
  if (!secret) return true; // no secret set → accept (a secret is strongly recommended)
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Extract card references like "#42" from a commit message / PR title+body. */
export function parseCardRefs(...texts: (string | null | undefined)[]): number[] {
  const ids = new Set<number>();
  const re = /#(\d+)/g;
  for (const text of texts) {
    if (!text) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) ids.add(n);
    }
  }
  return [...ids];
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
