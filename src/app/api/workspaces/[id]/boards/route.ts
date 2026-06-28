import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardPiles, boardUsers, boards, labels } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import {
  WORKSPACE_ADMIN_ROLE_ID,
  loadMembership,
  requireWorkspaceCap,
} from "@/lib/workspace-access";
import { BOARD_ADMIN_ROLE_ID } from "@/lib/board-access";

const DEFAULT_PILES: Array<{ title: string; color: string }> = [
  { title: "To do", color: "slate" },
  { title: "In progress", color: "amber" },
  { title: "Done", color: "lime" },
];

// Labels are board-scoped. New boards start with a small starter catalog
// describing the *kind* / *priority* of work (status lives in the piles).
const DEFAULT_LABELS: Array<{ title: string; color: string }> = [
  { title: "Bug", color: "coral" },
  { title: "Feature", color: "indigo" },
  { title: "Improvement", color: "sky" },
  { title: "Urgent", color: "pink" },
  { title: "Documentation", color: "teal" },
];

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "view_workspace");
  if (!guard.ok) return guard.response;

  const membership = await loadMembership(workspaceId, auth.session.sub);
  const isWsAdmin = membership?.workspaceRoleId === WORKSPACE_ADMIN_ROLE_ID;

  // Workspace admins see every board. Other users see only the boards
  // they're explicitly a member of.
  const rows = isWsAdmin
    ? await db
        .select({ id: boards.id, title: boards.title, createdAt: boards.createdAt })
        .from(boards)
        .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.deletedAt)))
    : await db
        .select({ id: boards.id, title: boards.title, createdAt: boards.createdAt })
        .from(boards)
        .innerJoin(boardUsers, eq(boardUsers.boardId, boards.id))
        .where(
          and(
            eq(boards.workspaceId, workspaceId),
            eq(boardUsers.userId, auth.session.sub),
            isNull(boards.deletedAt),
            isNull(boardUsers.deletedAt),
          ),
        );

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

  await db.insert(labels).values(
    DEFAULT_LABELS.map((d, idx) => ({
      boardId,
      title: d.title,
      color: d.color,
      position: idx + 1,
      isDefault: 1,
      createdAt: now,
      updatedAt: now,
    })),
  );

  // Creator becomes board_admin so a non-workspace-admin who creates a
  // board can still manage its members afterwards.
  await db.insert(boardUsers).values({
    boardId,
    userId: auth.session.sub,
    boardRoleId: BOARD_ADMIN_ROLE_ID,
    createdAt: now,
  });

  return NextResponse.json({ board: { id: boardId, title, workspaceId } }, { status: 201 });
}
