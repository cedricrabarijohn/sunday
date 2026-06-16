import { NextResponse } from "next/server";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskAssignees, boardTasks, boardUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireBoardCap } from "@/lib/workspace-access";
import {
  BOARD_ADMIN_ROLE_ID,
  BOARD_MEMBER_ROLE_ID,
  BOARD_VIEWER_ROLE_ID,
} from "@/lib/board-access";

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, userId } = await params;
  const boardId = Number(id);
  const targetId = Number(userId);
  if (!Number.isFinite(boardId) || !Number.isFinite(targetId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const removingSelf = targetId === auth.session.sub;
  // Self-leave only requires view_board. Removing someone else requires
  // manage_board_members.
  const guard = await requireBoardCap(
    boardId,
    auth.session.sub,
    removingSelf ? "view_board" : "manage_board_members",
  );
  if (!guard.ok) return guard.response;

  const [target] = await db
    .select({ roleId: boardUsers.boardRoleId })
    .from(boardUsers)
    .where(
      and(
        eq(boardUsers.boardId, boardId),
        eq(boardUsers.userId, targetId),
        isNull(boardUsers.deletedAt),
      ),
    )
    .limit(1);
  if (!target) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  // Refuse to leave the board stranded with no admin.
  if (target.roleId === BOARD_ADMIN_ROLE_ID) {
    const [otherAdmin] = await db
      .select({ userId: boardUsers.userId })
      .from(boardUsers)
      .where(
        and(
          eq(boardUsers.boardId, boardId),
          eq(boardUsers.boardRoleId, BOARD_ADMIN_ROLE_ID),
          ne(boardUsers.userId, targetId),
          isNull(boardUsers.deletedAt),
        ),
      )
      .limit(1);
    if (!otherAdmin) {
      return NextResponse.json(
        { error: "Cannot remove the last board admin. Promote someone else first." },
        { status: 409 },
      );
    }
  }

  await db
    .update(boardUsers)
    .set({ deletedAt: new Date() })
    .where(and(eq(boardUsers.boardId, boardId), eq(boardUsers.userId, targetId)));

  // Drop the user's assignments on any card in this board so they no
  // longer appear on cards they can't see.
  const taskRows = await db
    .select({ id: boardTasks.id })
    .from(boardTasks)
    .where(and(eq(boardTasks.boardId, boardId), isNull(boardTasks.deletedAt)));
  const taskIds = taskRows.map((t) => t.id);
  if (taskIds.length) {
    await db
      .delete(boardTaskAssignees)
      .where(
        and(
          eq(boardTaskAssignees.userId, targetId),
          inArray(boardTaskAssignees.boardTaskId, taskIds),
        ),
      );
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, userId } = await params;
  const boardId = Number(id);
  const targetId = Number(userId);
  if (!Number.isFinite(boardId) || !Number.isFinite(targetId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const roleId = Number(body?.boardRoleId);
  if (
    roleId !== BOARD_ADMIN_ROLE_ID &&
    roleId !== BOARD_MEMBER_ROLE_ID &&
    roleId !== BOARD_VIEWER_ROLE_ID
  ) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const guard = await requireBoardCap(boardId, auth.session.sub, "manage_board_members");
  if (!guard.ok) return guard.response;

  const [target] = await db
    .select({ roleId: boardUsers.boardRoleId })
    .from(boardUsers)
    .where(
      and(
        eq(boardUsers.boardId, boardId),
        eq(boardUsers.userId, targetId),
        isNull(boardUsers.deletedAt),
      ),
    )
    .limit(1);
  if (!target) return NextResponse.json({ error: "Not a member" }, { status: 404 });

  if (target.roleId === roleId) {
    return NextResponse.json({ ok: true });
  }

  // Refuse to demote the last admin.
  if (target.roleId === BOARD_ADMIN_ROLE_ID && roleId !== BOARD_ADMIN_ROLE_ID) {
    const [otherAdmin] = await db
      .select({ userId: boardUsers.userId })
      .from(boardUsers)
      .where(
        and(
          eq(boardUsers.boardId, boardId),
          eq(boardUsers.boardRoleId, BOARD_ADMIN_ROLE_ID),
          ne(boardUsers.userId, targetId),
          isNull(boardUsers.deletedAt),
        ),
      )
      .limit(1);
    if (!otherAdmin) {
      return NextResponse.json(
        { error: "Cannot demote the last board admin. Promote someone else first." },
        { status: 409 },
      );
    }
  }

  await db
    .update(boardUsers)
    .set({ boardRoleId: roleId })
    .where(
      and(
        eq(boardUsers.boardId, boardId),
        eq(boardUsers.userId, targetId),
        isNull(boardUsers.deletedAt),
      ),
    );

  return NextResponse.json({ ok: true });
}
