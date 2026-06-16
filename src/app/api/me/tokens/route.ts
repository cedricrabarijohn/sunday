import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { createApiToken, listApiTokens } from "@/lib/api-tokens";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** List the caller's active API tokens (metadata only — never the secret). */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const tokens = await listApiTokens(auth.session.sub);
  return NextResponse.json({ tokens });
}

/** Mint a new API token. The plaintext is returned once and never again. */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });
  if (name.length > 60) return NextResponse.json({ error: "Name too long" }, { status: 400 });

  let ttlMs: number | null = null;
  if (body?.expiresInDays != null) {
    const days = Number(body.expiresInDays);
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      return NextResponse.json({ error: "Invalid expiry" }, { status: 400 });
    }
    ttlMs = days * MS_PER_DAY;
  }

  const created = await createApiToken(auth.session.sub, name, ttlMs);
  return NextResponse.json({ token: created }, { status: 201 });
}
