import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTaskAssignees, boardUsers, users, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";
import { WORKSPACE_ADMIN_ROLE_ID } from "@/lib/workspace-access";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cardId = Number(id);
  const guard = await requireCardCap(cardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const rows = await db
    .select({
      userId: users.id,
      firstname: users.firstname,
      lastname: users.lastname,
      email: users.email,
    })
    .from(boardTaskAssignees)
    .innerJoin(users, eq(users.id, boardTaskAssignees.userId))
    .where(eq(boardTaskAssignees.boardTaskId, cardId));

  return NextResponse.json({ assignees: rows });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cardId = Number(id);
  const guard = await requireCardCap(cardId, auth.session.sub, "edit_card");
  if (!guard.ok) return guard.response;
  const { boardId, workspaceId } = guard;

  const body = await request.json().catch(() => null);
  const raw = Array.isArray(body?.userIds) ? body.userIds : null;
  if (!raw) {
    return NextResponse.json({ error: "userIds array is required" }, { status: 400 });
  }
  const userIds = Array.from(
    new Set(raw.map((n: unknown) => Number(n)).filter((n: number) => Number.isFinite(n))),
  ) as number[];

  if (userIds.length > 0) {
    // Eligible assignees = explicit board members + workspace admins.
    const boardMembers = await db
      .select({ userId: boardUsers.userId })
      .from(boardUsers)
      .where(
        and(
          eq(boardUsers.boardId, boardId),
          inArray(boardUsers.userId, userIds),
          isNull(boardUsers.deletedAt),
        ),
      );
    const workspaceAdmins = await db
      .select({ userId: workspaceUsers.userId })
      .from(workspaceUsers)
      .where(
        and(
          eq(workspaceUsers.workspaceId, workspaceId),
          eq(workspaceUsers.workspaceRoleId, WORKSPACE_ADMIN_ROLE_ID),
          inArray(workspaceUsers.userId, userIds),
          isNull(workspaceUsers.deletedAt),
        ),
      );
    const eligible = new Set<number>([
      ...boardMembers.map((r) => r.userId),
      ...workspaceAdmins.map((r) => r.userId),
    ]);
    const allEligible = userIds.every((uid) => eligible.has(uid));
    if (!allEligible) {
      return NextResponse.json(
        { error: "Only board members can be assigned to a card" },
        { status: 400 },
      );
    }
  }

  await db.delete(boardTaskAssignees).where(eq(boardTaskAssignees.boardTaskId, cardId));
  if (userIds.length > 0) {
    const now = new Date();
    await db.insert(boardTaskAssignees).values(
      userIds.map((userId) => ({
        boardTaskId: cardId,
        userId,
        createdAt: now,
      })),
    );
  }

  return NextResponse.json({ ok: true, userIds });
}
