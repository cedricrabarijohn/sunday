import { NextRequest, NextResponse } from "next/server";

/**
 * Tiny in-memory fixed-window rate limiter. Fine for a single long-lived
 * server (our bun process); swap for Redis if you ever run multiple instances.
 * Pinned to globalThis so it survives HMR in dev.
 */
type Bucket = { count: number; resetAt: number };
const globalForRl = globalThis as unknown as { __rateLimit?: Map<string, Bucket> };
const store = globalForRl.__rateLimit ?? new Map<string, Bucket>();
globalForRl.__rateLimit = store;

export function clientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") || "unknown";
}

/** Returns null when allowed, or a 429 response when the limit is exceeded. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (bucket.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Too many attempts. Please try again in a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  bucket.count += 1;
  return null;
}
