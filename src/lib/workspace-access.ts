import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardPiles,
  boardTaskAttachments,
  boardTaskItems,
  boardTasks,
  boards,
  labels,
  workspaceCapabilities,
  workspaceRoleCapabilities,
  workspaceUsers,
} from "@/db/schema";
import {
  BoardCapability,
  BoardCapabilitySet,
  loadBoardCapabilities,
  type LoadedBoardForAccess,
} from "@/lib/board-access";

export const WORKSPACE_ADMIN_ROLE_ID = 1;
export const WORKSPACE_MEMBER_ROLE_ID = 2;

/**
 * Workspace-scoped capabilities. Board / pile / card actions are now
 * board-scoped — see lib/board-access.ts.
 */
export type Capability =
  | "view_workspace"
  | "edit_workspace"
  | "delete_workspace"
  | "manage_members"
  | "manage_labels"
  | "create_board";

export type CapabilitySet = Set<Capability>;

export type WorkspaceMembership = {
  workspaceRoleId: number | null;
};

/** Returns the (active) membership row for (workspace, user) or null. */
export async function loadMembership(
  workspaceId: number,
  userId: number,
): Promise<WorkspaceMembership | null> {
  const [row] = await db
    .select({ workspaceRoleId: workspaceUsers.workspaceRoleId })
    .from(workspaceUsers)
    .where(
      and(
        eq(workspaceUsers.workspaceId, workspaceId),
        eq(workspaceUsers.userId, userId),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export function isAdmin(membership: WorkspaceMembership | null): boolean {
  return membership?.workspaceRoleId === WORKSPACE_ADMIN_ROLE_ID;
}

/**
 * Capabilities the user has in a given workspace, resolved through the
 * user's workspace role. Returns an empty set for non-members.
 */
export async function loadCapabilities(
  workspaceId: number,
  userId: number,
): Promise<CapabilitySet> {
  const rows = await db
    .select({ label: workspaceCapabilities.label })
    .from(workspaceUsers)
    .innerJoin(
      workspaceRoleCapabilities,
      eq(workspaceRoleCapabilities.workspaceRoleId, workspaceUsers.workspaceRoleId),
    )
    .innerJoin(
      workspaceCapabilities,
      eq(workspaceCapabilities.id, workspaceRoleCapabilities.workspaceCapabilityId),
    )
    .where(
      and(
        eq(workspaceUsers.workspaceId, workspaceId),
        eq(workspaceUsers.userId, userId),
        isNull(workspaceUsers.deletedAt),
        isNull(workspaceCapabilities.deletedAt),
      ),
    );
  return new Set(
    rows.map((r) => r.label as Capability).filter((l): l is Capability => Boolean(l)),
  ) as CapabilitySet;
}

type Ok<T> = { ok: true } & T;
type Fail = { ok: false; response: NextResponse };

function forbidden(reason: string): Fail {
  return { ok: false, response: NextResponse.json({ error: reason }, { status: 403 }) };
}

function notFound(): Fail {
  return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
}

function invalidId(): Fail {
  return { ok: false, response: NextResponse.json({ error: "Invalid id" }, { status: 400 }) };
}

/**
 * Require a workspace-scoped capability. Members of a workspace can
 * "view" it (catalog of boards / labels / their own profile); the rest
 * require explicit caps mapped to their workspace role.
 */
export async function requireWorkspaceCap(
  workspaceId: number,
  userId: number,
  capability: Capability,
): Promise<Ok<{ capabilities: CapabilitySet }> | Fail> {
  if (!Number.isFinite(workspaceId)) return invalidId();
  const caps = await loadCapabilities(workspaceId, userId);
  if (!caps.has("view_workspace")) return forbidden("Forbidden");
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);
  return { ok: true, capabilities: caps };
}

export type LoadedBoard = LoadedBoardForAccess;

/**
 * Require a board-scoped capability. Workspace admins implicitly have
 * every board cap; everyone else needs an explicit board membership
 * with a role that grants the requested cap.
 */
export async function requireBoardCap(
  boardId: number,
  userId: number,
  capability: BoardCapability,
): Promise<Ok<{ board: LoadedBoard; workspaceId: number; capabilities: BoardCapabilitySet }> | Fail> {
  if (!Number.isFinite(boardId)) return invalidId();
  const [board] = await db
    .select({
      id: boards.id,
      workspaceId: boards.workspaceId,
      title: boards.title,
      createdAt: boards.createdAt,
    })
    .from(boards)
    .where(and(eq(boards.id, boardId), isNull(boards.deletedAt)))
    .limit(1);
  if (!board || board.workspaceId == null) return notFound();

  const caps = await loadBoardCapabilities(board as LoadedBoardForAccess, userId);
  if (!caps.has("view_board")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);
  return { ok: true, board: board as LoadedBoard, workspaceId: board.workspaceId, capabilities: caps };
}

export type LoadedCard = {
  id: number;
  boardId: number | null;
  pileId: number | null;
  title: string | null;
  description: string | null;
  position: number | null;
  dueAt: Date | null;
};

export async function requireCardCap(
  cardId: number,
  userId: number,
  capability: BoardCapability,
): Promise<
  | Ok<{
      card: LoadedCard;
      boardId: number;
      workspaceId: number;
      capabilities: BoardCapabilitySet;
    }>
  | Fail
> {
  if (!Number.isFinite(cardId)) return invalidId();
  const [row] = await db
    .select({
      id: boardTasks.id,
      boardId: boardTasks.boardId,
      pileId: boardTasks.pileId,
      title: boardTasks.title,
      description: boardTasks.description,
      position: boardTasks.position,
      dueAt: boardTasks.dueAt,
      boardWorkspaceId: boards.workspaceId,
      boardTitle: boards.title,
      boardCreatedAt: boards.createdAt,
    })
    .from(boardTasks)
    .innerJoin(boards, eq(boards.id, boardTasks.boardId))
    .where(
      and(
        eq(boardTasks.id, cardId),
        isNull(boardTasks.deletedAt),
        isNull(boards.deletedAt),
      ),
    )
    .limit(1);
  if (!row || row.boardId == null || row.boardWorkspaceId == null) return notFound();

  const caps = await loadBoardCapabilities(
    {
      id: row.boardId,
      workspaceId: row.boardWorkspaceId,
      title: row.boardTitle,
      createdAt: row.boardCreatedAt,
    },
    userId,
  );
  if (!caps.has("view_board")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);

  return {
    ok: true,
    card: {
      id: row.id,
      boardId: row.boardId,
      pileId: row.pileId,
      title: row.title,
      description: row.description,
      position: row.position,
      dueAt: row.dueAt,
    },
    boardId: row.boardId,
    workspaceId: row.boardWorkspaceId,
    capabilities: caps,
  };
}

export type LoadedPile = {
  id: number;
  boardId: number;
  title: string | null;
  color: string | null;
  position: number;
};

export async function requirePileCap(
  pileId: number,
  userId: number,
  capability: BoardCapability,
): Promise<
  | Ok<{ pile: LoadedPile; boardId: number; workspaceId: number; capabilities: BoardCapabilitySet }>
  | Fail
> {
  if (!Number.isFinite(pileId)) return invalidId();
  const [row] = await db
    .select({
      id: boardPiles.id,
      boardId: boardPiles.boardId,
      title: boardPiles.title,
      color: boardPiles.color,
      position: boardPiles.position,
      boardWorkspaceId: boards.workspaceId,
      boardTitle: boards.title,
      boardCreatedAt: boards.createdAt,
    })
    .from(boardPiles)
    .innerJoin(boards, eq(boards.id, boardPiles.boardId))
    .where(and(eq(boardPiles.id, pileId), isNull(boardPiles.deletedAt), isNull(boards.deletedAt)))
    .limit(1);
  if (!row || row.boardWorkspaceId == null) return notFound();

  const caps = await loadBoardCapabilities(
    {
      id: row.boardId,
      workspaceId: row.boardWorkspaceId,
      title: row.boardTitle,
      createdAt: row.boardCreatedAt,
    },
    userId,
  );
  if (!caps.has("view_board")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);

  return {
    ok: true,
    pile: { id: row.id, boardId: row.boardId, title: row.title, color: row.color, position: row.position },
    boardId: row.boardId,
    workspaceId: row.boardWorkspaceId,
    capabilities: caps,
  };
}

export type LoadedLabel = {
  id: number;
  workspaceId: number;
  title: string;
  color: string;
  position: number | null;
  isDefault: number;
};

export async function requireLabelCap(
  labelId: number,
  userId: number,
  capability: Capability,
): Promise<Ok<{ label: LoadedLabel; capabilities: CapabilitySet }> | Fail> {
  if (!Number.isFinite(labelId)) return invalidId();
  const [row] = await db
    .select({
      id: labels.id,
      workspaceId: labels.workspaceId,
      title: labels.title,
      color: labels.color,
      position: labels.position,
      isDefault: labels.isDefault,
    })
    .from(labels)
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);
  if (!row) return notFound();
  const caps = await loadCapabilities(row.workspaceId, userId);
  if (!caps.has("view_workspace")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);
  return { ok: true, label: row, capabilities: caps };
}

export async function requireItemCap(
  itemId: number,
  userId: number,
  capability: BoardCapability,
): Promise<
  | Ok<{
      itemId: number;
      cardId: number;
      boardId: number;
      workspaceId: number;
      capabilities: BoardCapabilitySet;
    }>
  | Fail
> {
  if (!Number.isFinite(itemId)) return invalidId();
  const [row] = await db
    .select({
      itemId: boardTaskItems.id,
      cardId: boardTaskItems.boardTaskId,
      boardId: boardTasks.boardId,
      boardWorkspaceId: boards.workspaceId,
      boardTitle: boards.title,
      boardCreatedAt: boards.createdAt,
    })
    .from(boardTaskItems)
    .innerJoin(boardTasks, eq(boardTasks.id, boardTaskItems.boardTaskId))
    .innerJoin(boards, eq(boards.id, boardTasks.boardId))
    .where(
      and(
        eq(boardTaskItems.id, itemId),
        isNull(boardTaskItems.deletedAt),
        isNull(boardTasks.deletedAt),
        isNull(boards.deletedAt),
      ),
    )
    .limit(1);
  if (!row || row.boardId == null || row.boardWorkspaceId == null) return notFound();
  const caps = await loadBoardCapabilities(
    {
      id: row.boardId,
      workspaceId: row.boardWorkspaceId,
      title: row.boardTitle,
      createdAt: row.boardCreatedAt,
    },
    userId,
  );
  if (!caps.has("view_board")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);
  return {
    ok: true,
    itemId: row.itemId,
    cardId: row.cardId,
    boardId: row.boardId,
    workspaceId: row.boardWorkspaceId,
    capabilities: caps,
  };
}

export async function requireAttachmentCap(
  attachmentId: number,
  userId: number,
  capability: BoardCapability,
): Promise<
  | Ok<{
      attachment: {
        id: number;
        url: string | null;
        storageKey: string | null;
        boardTaskId: number;
      };
      boardId: number;
      workspaceId: number;
      capabilities: BoardCapabilitySet;
    }>
  | Fail
> {
  if (!Number.isFinite(attachmentId)) return invalidId();
  const [row] = await db
    .select({
      id: boardTaskAttachments.id,
      url: boardTaskAttachments.url,
      storageKey: boardTaskAttachments.storageKey,
      boardTaskId: boardTaskAttachments.boardTaskId,
      boardId: boardTasks.boardId,
      boardWorkspaceId: boards.workspaceId,
      boardTitle: boards.title,
      boardCreatedAt: boards.createdAt,
    })
    .from(boardTaskAttachments)
    .innerJoin(boardTasks, eq(boardTasks.id, boardTaskAttachments.boardTaskId))
    .innerJoin(boards, eq(boards.id, boardTasks.boardId))
    .where(
      and(
        eq(boardTaskAttachments.id, attachmentId),
        isNull(boardTaskAttachments.deletedAt),
        isNull(boardTasks.deletedAt),
        isNull(boards.deletedAt),
      ),
    )
    .limit(1);
  if (!row || row.boardWorkspaceId == null || row.boardId == null) return notFound();
  const caps = await loadBoardCapabilities(
    {
      id: row.boardId,
      workspaceId: row.boardWorkspaceId,
      title: row.boardTitle,
      createdAt: row.boardCreatedAt,
    },
    userId,
  );
  if (!caps.has("view_board")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);
  return {
    ok: true,
    attachment: {
      id: row.id,
      url: row.url,
      storageKey: row.storageKey,
      boardTaskId: row.boardTaskId,
    },
    boardId: row.boardId,
    workspaceId: row.boardWorkspaceId,
    capabilities: caps,
  };
}
