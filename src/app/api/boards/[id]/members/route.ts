import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardUsers, users } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireBoardCap } from "@/lib/workspace-access";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const rows = await db
    .select({
      userId: boardUsers.userId,
      boardRoleId: boardUsers.boardRoleId,
      firstname: users.firstname,
      lastname: users.lastname,
      email: users.email,
    })
    .from(boardUsers)
    .innerJoin(users, eq(users.id, boardUsers.userId))
    .where(and(eq(boardUsers.boardId, boardId), isNull(boardUsers.deletedAt), isNull(users.deletedAt)));

  return NextResponse.json({
    members: rows,
    currentUserId: auth.session.sub,
    capabilities: Array.from(guard.capabilities),
  });
}
