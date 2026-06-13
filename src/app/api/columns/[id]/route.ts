import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { boardColumns } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireBoardCap } from "@/lib/workspace-access";
import { normalizeConfig, type FieldType } from "@/lib/fields";

async function loadColumn(columnId: number) {
  const [col] = await db
    .select({
      id: boardColumns.id,
      boardId: boardColumns.boardId,
      label: boardColumns.label,
      type: boardColumns.type,
      config: boardColumns.config,
      position: boardColumns.position,
      deletedAt: boardColumns.deletedAt,
    })
    .from(boardColumns)
    .where(eq(boardColumns.id, columnId))
    .limit(1);
  return col;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const columnId = Number((await params).id);
  const col = await loadColumn(columnId);
  if (!col || col.deletedAt || col.boardId == null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const guard = await requireBoardCap(col.boardId, auth.session.sub, "edit_board");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const updates: { label?: string; config?: unknown; position?: number } = {};

  if (typeof body?.label === "string") {
    const label = body.label.trim();
    if (!label) return NextResponse.json({ error: "Field name is required" }, { status: 400 });
    if (label.length > 60) return NextResponse.json({ error: "Field name too long" }, { status: 400 });
    updates.label = label;
  }
  if (body?.config !== undefined) {
    // Only select-likes carry config; keep the field's existing type.
    updates.config = normalizeConfig((col.type as FieldType) ?? "text", body.config);
  }
  if (typeof body?.position === "number" && Number.isFinite(body.position)) {
    updates.position = Math.trunc(body.position);
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await db.update(boardColumns).set(updates).where(eq(boardColumns.id, columnId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const columnId = Number((await params).id);
  const col = await loadColumn(columnId);
  if (!col || col.deletedAt || col.boardId == null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const guard = await requireBoardCap(col.boardId, auth.session.sub, "edit_board");
  if (!guard.ok) return guard.response;

  // Soft-delete the field; its values are filtered out by the column join.
  await db.update(boardColumns).set({ deletedAt: new Date() }).where(eq(boardColumns.id, columnId));
  return NextResponse.json({ ok: true });
}
