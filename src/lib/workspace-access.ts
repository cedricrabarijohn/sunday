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

export const WORKSPACE_ADMIN_ROLE_ID = 1;
export const WORKSPACE_MEMBER_ROLE_ID = 2;

/**
 * Every capability the app understands. Keeping them as a union type
 * means the compiler catches typos when calling requireWorkspaceCap.
 */
export type Capability =
  | "view_workspace"
  | "edit_workspace"
  | "delete_workspace"
  | "manage_members"
  | "manage_labels"
  | "manage_piles"
  | "create_board"
  | "edit_board"
  | "delete_board"
  | "create_card"
  | "edit_card"
  | "delete_card";

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
 * Require a workspace-scoped capability. Resolves to either { ok: true }
 * with the user's full capability set, or { ok: false } with a 4xx
 * response the route handler can return directly.
 *
 * - Non-member -> 403
 * - Member without the requested capability -> 403 (with the missing cap)
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

export type LoadedBoard = {
  id: number;
  workspaceId: number | null;
  title: string | null;
  createdAt: Date | null;
};

/**
 * Load a board, then check membership + capability for its workspace.
 *
 * - Board missing or workspace missing -> 404
 * - Non-member -> 404 (same shape; doesn't leak existence)
 * - Member without capability -> 403
 */
export async function requireBoardCap(
  boardId: number,
  userId: number,
  capability: Capability,
): Promise<Ok<{ board: LoadedBoard; workspaceId: number; capabilities: CapabilitySet }> | Fail> {
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

  const caps = await loadCapabilities(board.workspaceId, userId);
  if (!caps.has("view_workspace")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);

  return { ok: true, board, workspaceId: board.workspaceId, capabilities: caps };
}

export type LoadedCard = {
  id: number;
  boardId: number | null;
  pileId: number | null;
  title: string | null;
  description: string | null;
  position: number | null;
};

/**
 * Load a card, then check membership + capability for its workspace.
 */
export async function requireCardCap(
  cardId: number,
  userId: number,
  capability: Capability,
): Promise<
  | Ok<{
      card: LoadedCard;
      boardId: number;
      workspaceId: number;
      capabilities: CapabilitySet;
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
      workspaceId: boards.workspaceId,
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
  if (!row || row.boardId == null || row.workspaceId == null) return notFound();

  const caps = await loadCapabilities(row.workspaceId, userId);
  if (!caps.has("view_workspace")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);

  const { workspaceId, ...rest } = row;
  return {
    ok: true,
    card: rest,
    boardId: row.boardId,
    workspaceId,
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
  capability: Capability,
): Promise<
  | Ok<{ pile: LoadedPile; boardId: number; workspaceId: number; capabilities: CapabilitySet }>
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
      workspaceId: boards.workspaceId,
    })
    .from(boardPiles)
    .innerJoin(boards, eq(boards.id, boardPiles.boardId))
    .where(and(eq(boardPiles.id, pileId), isNull(boardPiles.deletedAt), isNull(boards.deletedAt)))
    .limit(1);
  if (!row || row.workspaceId == null) return notFound();

  const caps = await loadCapabilities(row.workspaceId, userId);
  if (!caps.has("view_workspace")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);

  const { workspaceId, ...pile } = row;
  return { ok: true, pile, boardId: row.boardId, workspaceId, capabilities: caps };
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
  capability: Capability,
): Promise<
  | Ok<{
      itemId: number;
      cardId: number;
      boardId: number;
      workspaceId: number;
      capabilities: CapabilitySet;
    }>
  | Fail
> {
  if (!Number.isFinite(itemId)) return invalidId();
  const [row] = await db
    .select({
      itemId: boardTaskItems.id,
      cardId: boardTaskItems.boardTaskId,
      boardId: boardTasks.boardId,
      workspaceId: boards.workspaceId,
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
  if (!row || row.boardId == null || row.workspaceId == null) return notFound();
  const caps = await loadCapabilities(row.workspaceId, userId);
  if (!caps.has("view_workspace")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);
  return {
    ok: true,
    itemId: row.itemId,
    cardId: row.cardId,
    boardId: row.boardId,
    workspaceId: row.workspaceId,
    capabilities: caps,
  };
}

export async function requireAttachmentCap(
  attachmentId: number,
  userId: number,
  capability: Capability,
): Promise<
  | Ok<{
      attachment: {
        id: number;
        url: string | null;
        storageKey: string | null;
        boardTaskId: number;
      };
      workspaceId: number;
      capabilities: CapabilitySet;
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
      workspaceId: boards.workspaceId,
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
  if (!row || row.workspaceId == null) return notFound();
  const caps = await loadCapabilities(row.workspaceId, userId);
  if (!caps.has("view_workspace")) return notFound();
  if (!caps.has(capability)) return forbidden(`Missing capability: ${capability}`);
  const { workspaceId, ...attachment } = row;
  return { ok: true, attachment, workspaceId, capabilities: caps };
}
