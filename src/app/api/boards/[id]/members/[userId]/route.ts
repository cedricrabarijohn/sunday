import { NextResponse } from "next/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { boardUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireBoardCap } from "@/lib/workspace-access";
import { BOARD_ADMIN_ROLE_ID } from "@/lib/board-access";

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

  return NextResponse.json({ ok: true });
}
