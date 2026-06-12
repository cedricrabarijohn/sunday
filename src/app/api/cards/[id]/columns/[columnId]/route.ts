import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { boardColumns, boardTaskColumns } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";
import { coerceValue, parseConfig, type FieldType } from "@/lib/fields";

/** Set (or clear) a custom-field value on a card. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; columnId: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, columnId: columnIdRaw } = await params;
  const cardId = Number(id);
  const columnId = Number(columnIdRaw);

  const guard = await requireCardCap(cardId, auth.session.sub, "edit_card");
  if (!guard.ok) return guard.response;

  const [col] = await db
    .select({
      id: boardColumns.id,
      boardId: boardColumns.boardId,
      type: boardColumns.type,
      config: boardColumns.config,
      deletedAt: boardColumns.deletedAt,
    })
    .from(boardColumns)
    .where(eq(boardColumns.id, columnId))
    .limit(1);

  if (!col || col.deletedAt || col.boardId !== guard.boardId) {
    return NextResponse.json({ error: "Field not found on this board" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const result = coerceValue(col.type as FieldType, body?.value, parseConfig(col.config));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  if (result.value === null) {
    await db
      .delete(boardTaskColumns)
      .where(
        and(eq(boardTaskColumns.boardColumnId, columnId), eq(boardTaskColumns.boardTaskId, cardId)),
      );
    return NextResponse.json({ ok: true, value: null });
  }

  await db
    .insert(boardTaskColumns)
    .values({ boardColumnId: columnId, boardTaskId: cardId, value: result.value })
    .onDuplicateKeyUpdate({ set: { value: result.value } });

  return NextResponse.json({ ok: true, value: result.value });
}
