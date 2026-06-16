import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { revokeApiToken } from "@/lib/api-tokens";

/** Revoke one of the caller's API tokens. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const tokenId = Number(id);
  if (!Number.isFinite(tokenId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const ok = await revokeApiToken(auth.session.sub, tokenId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
