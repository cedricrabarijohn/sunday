import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { labels } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { ALLOWED_COLORS } from "@/lib/label-access";
import { requireLabelCap } from "@/lib/workspace-access";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const labelId = Number(id);
  const guard = await requireLabelCap(labelId, auth.session.sub, "manage_labels");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const updates: Partial<{
    title: string;
    color: string;
    description: string | null;
    position: number;
  }> = {};

  if (typeof body?.title === "string") {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    if (t.length > 50) return NextResponse.json({ error: "title too long" }, { status: 400 });
    updates.title = t;
  }
  if (typeof body?.color === "string") {
    if (!ALLOWED_COLORS.has(body.color)) {
      return NextResponse.json({ error: "Unknown color" }, { status: 400 });
    }
    updates.color = body.color;
  }
  if (typeof body?.description === "string" || body?.description === null) {
    const d = body.description ? body.description.toString().slice(0, 120) : null;
    updates.description = d;
  }
  if (typeof body?.position === "number" && Number.isFinite(body.position)) {
    updates.position = body.position;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  await db
    .update(labels)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(labels.id, labelId));

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const labelId = Number(id);
  const guard = await requireLabelCap(labelId, auth.session.sub, "manage_labels");
  if (!guard.ok) return guard.response;

  await db
    .update(labels)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(labels.id, labelId));

  return NextResponse.json({ ok: true });
}
