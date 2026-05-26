import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardPiles, boards } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireWorkspaceCap } from "@/lib/workspace-access";

const DEFAULT_PILES: Array<{ title: string; color: string }> = [
  { title: "To do", color: "slate" },
  { title: "In progress", color: "amber" },
  { title: "Done", color: "lime" },
];

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "view_workspace");
  if (!guard.ok) return guard.response;

  const rows = await db
    .select({ id: boards.id, title: boards.title, createdAt: boards.createdAt })
    .from(boards)
    .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.deletedAt)));

  return NextResponse.json({ boards: rows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "create_board");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const title = (body?.title ?? "").toString().trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (title.length > 100) return NextResponse.json({ error: "title too long" }, { status: 400 });

  const now = new Date();
  const [result] = await db.insert(boards).values({
    workspaceId,
    title,
    createdAt: now,
  });
  const boardId = Number((result as { insertId: number }).insertId);

  await db.insert(boardPiles).values(
    DEFAULT_PILES.map((p, idx) => ({
      boardId,
      title: p.title,
      color: p.color,
      position: idx + 1,
      createdAt: now,
      updatedAt: now,
    })),
  );

  return NextResponse.json({ board: { id: boardId, title, workspaceId } }, { status: 201 });
}
