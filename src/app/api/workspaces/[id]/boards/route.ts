import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardPiles, boards, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";

const DEFAULT_PILES: Array<{ title: string; color: string }> = [
  { title: "To do", color: "slate" },
  { title: "In progress", color: "amber" },
  { title: "Done", color: "lime" },
];

async function memberOf(userId: number, workspaceId: number) {
  const [row] = await db
    .select({ id: workspaceUsers.workspaceId })
    .from(workspaceUsers)
    .where(
      and(
        eq(workspaceUsers.userId, userId),
        eq(workspaceUsers.workspaceId, workspaceId),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  return !!row;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  if (!Number.isFinite(workspaceId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!(await memberOf(auth.session.sub, workspaceId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  if (!Number.isFinite(workspaceId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  if (!(await memberOf(auth.session.sub, workspaceId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
