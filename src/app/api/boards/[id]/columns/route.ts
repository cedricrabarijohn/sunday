import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { db } from "@/db/client";
import { boardColumns } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireBoardCap } from "@/lib/workspace-access";
import { isFieldType, normalizeConfig, parseConfig } from "@/lib/fields";
import { publishBoard } from "@/lib/board-bus";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const boardId = Number((await params).id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const rows = await db
    .select({
      id: boardColumns.id,
      label: boardColumns.label,
      type: boardColumns.type,
      config: boardColumns.config,
      position: boardColumns.position,
    })
    .from(boardColumns)
    .where(and(eq(boardColumns.boardId, boardId), isNull(boardColumns.deletedAt)))
    .orderBy(asc(boardColumns.position), asc(boardColumns.id));

  return NextResponse.json({
    columns: rows.map((c) => ({ ...c, config: parseConfig(c.config) })),
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const boardId = Number((await params).id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "edit_board");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const label = (body?.label ?? "").toString().trim();
  const type = body?.type;
  if (!label) return NextResponse.json({ error: "Field name is required" }, { status: 400 });
  if (label.length > 60) return NextResponse.json({ error: "Field name too long" }, { status: 400 });
  if (!isFieldType(type)) return NextResponse.json({ error: "Unknown field type" }, { status: 400 });

  const config = normalizeConfig(type, body?.config);

  const [maxRow] = await db
    .select({ value: max(boardColumns.position) })
    .from(boardColumns)
    .where(and(eq(boardColumns.boardId, boardId), isNull(boardColumns.deletedAt)));
  const position = (maxRow?.value ?? 0) + 1;

  const [res] = await db.insert(boardColumns).values({ boardId, label, type, config, position });
  const columnId = Number((res as { insertId: number }).insertId);

  const column = { id: columnId, label, type, config, position };
  publishBoard(boardId, { type: "column_created", column });

  return NextResponse.json({ column }, { status: 201 });
}
