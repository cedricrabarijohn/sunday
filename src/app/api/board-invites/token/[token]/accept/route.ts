import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardInvites, boardUsers, boards, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { WORKSPACE_MEMBER_ROLE_ID } from "@/lib/workspace-access";

export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const [invite] = await db
    .select()
    .from(boardInvites)
    .where(eq(boardInvites.token, token))
    .limit(1);
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Invite is no longer valid" }, { status: 410 });
  }
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 410 });
  }

  const [board] = await db
    .select({ id: boards.id, workspaceId: boards.workspaceId })
    .from(boards)
    .where(and(eq(boards.id, invite.boardId), isNull(boards.deletedAt)))
    .limit(1);
  if (!board || board.workspaceId == null) {
    return NextResponse.json({ error: "Board no longer exists" }, { status: 410 });
  }

  const now = new Date();

  // Ensure the user is a workspace member; create the membership at
  // member level if they aren't yet. This lets a board invite alone
  // be enough to onboard someone into the workspace.
  const [wsRow] = await db
    .select({
      userId: workspaceUsers.userId,
      roleId: workspaceUsers.workspaceRoleId,
      deletedAt: workspaceUsers.deletedAt,
    })
    .from(workspaceUsers)
    .where(
      and(
        eq(workspaceUsers.workspaceId, board.workspaceId),
        eq(workspaceUsers.userId, auth.session.sub),
      ),
    )
    .limit(1);

  if (!wsRow) {
    await db.insert(workspaceUsers).values({
      workspaceId: board.workspaceId,
      userId: auth.session.sub,
      workspaceRoleId: WORKSPACE_MEMBER_ROLE_ID,
    });
  } else if (wsRow.deletedAt) {
    await db
      .update(workspaceUsers)
      .set({ deletedAt: null })
      .where(
        and(
          eq(workspaceUsers.workspaceId, board.workspaceId),
          eq(workspaceUsers.userId, auth.session.sub),
        ),
      );
  }

  // Add or reactivate the board membership.
  const [existing] = await db
    .select({ id: boardUsers.id, deletedAt: boardUsers.deletedAt })
    .from(boardUsers)
    .where(and(eq(boardUsers.boardId, board.id), eq(boardUsers.userId, auth.session.sub)))
    .limit(1);

  if (!existing) {
    await db.insert(boardUsers).values({
      boardId: board.id,
      userId: auth.session.sub,
      boardRoleId: invite.boardRoleId,
      createdAt: now,
    });
  } else if (existing.deletedAt) {
    await db
      .update(boardUsers)
      .set({ deletedAt: null, boardRoleId: invite.boardRoleId })
      .where(eq(boardUsers.id, existing.id));
  }

  await db
    .update(boardInvites)
    .set({ status: "accepted", acceptedAt: now, acceptedByUserId: auth.session.sub })
    .where(eq(boardInvites.id, invite.id));

  if (invite.email) {
    await db
      .update(boardInvites)
      .set({ status: "accepted", acceptedAt: now, acceptedByUserId: auth.session.sub })
      .where(
        and(
          eq(boardInvites.boardId, board.id),
          eq(boardInvites.email, invite.email),
          eq(boardInvites.status, "pending"),
        ),
      );
  }

  return NextResponse.json({ ok: true, boardId: board.id });
}
