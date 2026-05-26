import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskItems } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireItemCap } from "@/lib/workspace-access";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const itemId = Number(id);
  const guard = await requireItemCap(itemId, auth.session.sub, "edit_card");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const updates: Partial<{ title: string; done: number }> = {};
  if (typeof body?.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    if (t.length > 255) return NextResponse.json({ error: "title too long" }, { status: 400 });
    updates.title = t;
  }
  if (typeof body?.done === "boolean") {
    updates.done = body.done ? 1 : 0;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  await db
    .update(boardTaskItems)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(boardTaskItems.id, itemId));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const itemId = Number(id);
  const guard = await requireItemCap(itemId, auth.session.sub, "edit_card");
  if (!guard.ok) return guard.response;

  await db
    .update(boardTaskItems)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(boardTaskItems.id, itemId));

  return NextResponse.json({ ok: true });
}
