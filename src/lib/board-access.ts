import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardCapabilities,
  boardRoleCapabilities,
  boardUsers,
  boards,
} from "@/db/schema";
import { WORKSPACE_ADMIN_ROLE_ID, loadMembership } from "@/lib/workspace-access";

export const BOARD_ADMIN_ROLE_ID = 1;
export const BOARD_MEMBER_ROLE_ID = 2;

export type BoardCapability =
  | "view_board"
  | "edit_board"
  | "delete_board"
  | "manage_board_members"
  | "manage_piles"
  | "create_card"
  | "edit_card"
  | "delete_card";

export type BoardCapabilitySet = Set<BoardCapability>;

const ALL_BOARD_CAPS: BoardCapabilitySet = new Set<BoardCapability>([
  "view_board",
  "edit_board",
  "delete_board",
  "manage_board_members",
  "manage_piles",
  "create_card",
  "edit_card",
  "delete_card",
]);

export type LoadedBoardForAccess = {
  id: number;
  workspaceId: number;
  title: string | null;
  createdAt: Date | null;
};

async function loadBoard(boardId: number): Promise<LoadedBoardForAccess | null> {
  const [row] = await db
    .select({
      id: boards.id,
      workspaceId: boards.workspaceId,
      title: boards.title,
      createdAt: boards.createdAt,
    })
    .from(boards)
    .where(and(eq(boards.id, boardId), isNull(boards.deletedAt)))
    .limit(1);
  if (!row || row.workspaceId == null) return null;
  return row as LoadedBoardForAccess;
}

/**
 * Resolves the caller's capabilities for a board, with workspace-admin
 * escalation:
 *
 *   - Not a workspace member  -> empty set (no access)
 *   - Workspace admin         -> every board capability (implicit board admin)
 *   - Workspace member, not a board member -> empty set (board is hidden)
 *   - Workspace member + explicit board member -> caps from board role
 */
export async function loadBoardCapabilities(
  board: LoadedBoardForAccess,
  userId: number,
): Promise<BoardCapabilitySet> {
  const ws = await loadMembership(board.workspaceId, userId);
  if (!ws) return new Set();
  if (ws.workspaceRoleId === WORKSPACE_ADMIN_ROLE_ID) return new Set(ALL_BOARD_CAPS);

  const [explicit] = await db
    .select({ roleId: boardUsers.boardRoleId })
    .from(boardUsers)
    .where(
      and(
        eq(boardUsers.boardId, board.id),
        eq(boardUsers.userId, userId),
        isNull(boardUsers.deletedAt),
      ),
    )
    .limit(1);
  if (!explicit) return new Set();

  const rows = await db
    .select({ label: boardCapabilities.label })
    .from(boardRoleCapabilities)
    .innerJoin(
      boardCapabilities,
      eq(boardCapabilities.id, boardRoleCapabilities.boardCapabilityId),
    )
    .where(
      and(
        eq(boardRoleCapabilities.boardRoleId, explicit.roleId),
        isNull(boardCapabilities.deletedAt),
      ),
    );
  return new Set(
    rows
      .map((r) => r.label as BoardCapability)
      .filter((l): l is BoardCapability => Boolean(l)),
  );
}

type Ok<T> = { ok: true } & T;
type Fail = { ok: false; response: NextResponse };

function notFound(): Fail {
  return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
}
function invalidId(): Fail {
  return { ok: false, response: NextResponse.json({ error: "Invalid id" }, { status: 400 }) };
}
function forbidden(reason: string): Fail {
  return { ok: false, response: NextResponse.json({ error: reason }, { status: 403 }) };
}

/**
 * Require a board capability for the caller. Returns the loaded board
 * plus the caller's resolved capability set on success.
 */
export async function requireBoardCap(
  boardId: number,
  userId: number,
  capability: BoardCapability,
): Promise<
  | Ok<{ board: LoadedBoardForAccess; workspaceId: number; capabilities: BoardCapabilitySet }>
  | Fail
> {
  if (!Number.isFinite(boardId)) return invalidId();
  const board = await loadBoard(boardId);
  if (!board) return notFound();
  const caps = await loadBoardCapabilities(board, userId);
  if (!caps.has("view_board")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);
  return { ok: true, board, workspaceId: board.workspaceId, capabilities: caps };
}

export type {
  BoardCapability as Capability,
  BoardCapabilitySet as CapabilitySet,
};
