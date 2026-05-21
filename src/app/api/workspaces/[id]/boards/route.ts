import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boards, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";

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

  const [result] = await db.insert(boards).values({
    workspaceId,
    title,
    createdAt: new Date(),
  });
  const boardId = Number((result as { insertId: number }).insertId);
  return NextResponse.json({ board: { id: boardId, title, workspaceId } }, { status: 201 });
}
