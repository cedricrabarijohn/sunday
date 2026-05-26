import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { boardInvites, boards, users, workspaces } from "@/db/schema";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const [row] = await db
    .select({
      id: boardInvites.id,
      boardId: boardInvites.boardId,
      boardTitle: boards.title,
      workspaceId: boards.workspaceId,
      workspaceTitle: workspaces.title,
      email: boardInvites.email,
      boardRoleId: boardInvites.boardRoleId,
      status: boardInvites.status,
      createdAt: boardInvites.createdAt,
      expiresAt: boardInvites.expiresAt,
      invitedByEmail: users.email,
      invitedByFirstname: users.firstname,
      invitedByLastname: users.lastname,
    })
    .from(boardInvites)
    .leftJoin(boards, eq(boards.id, boardInvites.boardId))
    .leftJoin(workspaces, eq(workspaces.id, boards.workspaceId))
    .leftJoin(users, eq(users.id, boardInvites.invitedByUserId))
    .where(eq(boardInvites.token, token))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const expired = row.expiresAt ? row.expiresAt.getTime() < Date.now() : false;
  return NextResponse.json({ invite: { ...row, expired } });
}
