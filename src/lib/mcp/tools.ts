import { and, asc, eq, inArray, isNull, like, max } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardColumns,
  boardPiles,
  boards,
  boardTaskAssignees,
  boardTaskAttachments,
  boardTaskComments,
  boardTaskItems,
  boardTaskLabels,
  boardTaskColumns,
  boardTasks,
  boardUsers,
  labels,
  notifications,
  users,
  workspaces,
  workspaceUsers,
} from "@/db/schema";
import {
  FIELD_TYPES,
  coerceValue,
  isFieldType,
  normalizeConfig,
  parseConfig,
  parseValue,
} from "@/lib/fields";
import {
  BOARD_ADMIN_ROLE_ID,
  loadBoardCapabilities,
  type LoadedBoardForAccess,
} from "@/lib/board-access";
import { WORKSPACE_ADMIN_ROLE_ID, loadCapabilities } from "@/lib/workspace-access";
import { ALLOWED_COLORS } from "@/lib/label-access";
import { publishBoard, type BoardAssignee } from "@/lib/board-bus";
import { publishCard } from "@/lib/card-bus";
import { publishCardCounts } from "@/lib/card-counts";
import { emitNotifications } from "@/lib/notify";

/**
 * MCP tool definitions for Sunday. Every handler runs as a specific user
 * (resolved from their API token) and re-checks that user's board
 * capabilities, so the MCP surface can never exceed what the user could do
 * in the UI.
 */
export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (userId: number, args: Record<string, unknown>) => Promise<unknown>;
};

class ToolError extends Error {}

// --- shared helpers -------------------------------------------------------

async function loadBoardRow(boardId: number): Promise<LoadedBoardForAccess | null> {
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
  return (row as LoadedBoardForAccess) ?? null;
}

/** Load a board the user can see, plus their capability set, or throw. */
async function boardContext(boardId: number, userId: number) {
  if (!Number.isFinite(boardId)) throw new ToolError("board_id must be a number");
  const board = await loadBoardRow(boardId);
  if (!board) throw new ToolError(`Board ${boardId} not found`);
  const caps = await loadBoardCapabilities(board, userId);
  if (!caps.has("view_board")) throw new ToolError(`No access to board ${boardId}`);
  return { board, caps };
}

async function cardContext(cardId: number, userId: number) {
  if (!Number.isFinite(cardId)) throw new ToolError("card_id must be a number");
  const [card] = await db
    .select({
      id: boardTasks.id,
      boardId: boardTasks.boardId,
      pileId: boardTasks.pileId,
      title: boardTasks.title,
      description: boardTasks.description,
      dueAt: boardTasks.dueAt,
    })
    .from(boardTasks)
    .where(and(eq(boardTasks.id, cardId), isNull(boardTasks.deletedAt)))
    .limit(1);
  if (!card || card.boardId == null) throw new ToolError(`Card ${cardId} not found`);
  const { board, caps } = await boardContext(card.boardId, userId);
  return { card, board, caps };
}

function requireCap(caps: ReadonlySet<string>, cap: string): void {
  if (!caps.has(cap)) throw new ToolError(`Missing capability: ${cap}`);
}

/** Resolve a sub-task (checklist item) to its card + the caller's caps, or throw. */
async function itemContext(itemId: number, userId: number) {
  if (!Number.isFinite(itemId)) throw new ToolError("subtask_id must be a number");
  const [item] = await db
    .select({
      id: boardTaskItems.id,
      boardTaskId: boardTaskItems.boardTaskId,
      title: boardTaskItems.title,
      done: boardTaskItems.done,
    })
    .from(boardTaskItems)
    .where(and(eq(boardTaskItems.id, itemId), isNull(boardTaskItems.deletedAt)))
    .limit(1);
  if (!item || item.boardTaskId == null) throw new ToolError(`Sub-task ${itemId} not found`);
  const { card, board, caps } = await cardContext(item.boardTaskId, userId);
  return { item, card, board, caps };
}

/** Resolve a `pile` argument (numeric id or case-insensitive name) within a board. */
async function resolvePile(boardId: number, pile: unknown): Promise<number> {
  const rows = await db
    .select({ id: boardPiles.id, title: boardPiles.title })
    .from(boardPiles)
    .where(and(eq(boardPiles.boardId, boardId), isNull(boardPiles.deletedAt)))
    .orderBy(asc(boardPiles.position), asc(boardPiles.id));
  if (rows.length === 0) throw new ToolError("This board has no piles");
  if (typeof pile === "number") {
    const hit = rows.find((r) => r.id === pile);
    if (!hit) throw new ToolError(`Pile ${pile} is not on this board`);
    return hit.id;
  }
  if (typeof pile === "string" && pile.trim()) {
    const needle = pile.trim().toLowerCase();
    const hit = rows.find((r) => (r.title ?? "").toLowerCase() === needle);
    if (!hit) {
      const names = rows.map((r) => r.title).filter(Boolean).join(", ");
      throw new ToolError(`No pile named "${pile}". Piles: ${names}`);
    }
    return hit.id;
  }
  // Default: first pile.
  return rows[0].id;
}

async function pileOrder(pileId: number): Promise<number[]> {
  const rows = await db
    .select({ id: boardTasks.id })
    .from(boardTasks)
    .where(and(eq(boardTasks.pileId, pileId), isNull(boardTasks.deletedAt)))
    .orderBy(asc(boardTasks.position), asc(boardTasks.id));
  return rows.map((r) => r.id);
}

function numArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((n) => Number(n)).filter((n) => Number.isFinite(n));
}

/**
 * Compute a target id set from add/remove/set arguments. `set` replaces the
 * whole list; otherwise we start from `current`, add `add`, drop `remove`.
 * AI-friendly: callers don't need to know the current roster to tweak it.
 */
function resolveIdSet(
  current: number[],
  args: Record<string, unknown>,
): number[] {
  if ("set" in args && Array.isArray(args.set)) {
    return Array.from(new Set(numArray(args.set)));
  }
  const next = new Set(current);
  for (const id of numArray(args.add)) next.add(id);
  for (const id of numArray(args.remove)) next.delete(id);
  return Array.from(next);
}

async function commentContext(commentId: number, userId: number) {
  if (!Number.isFinite(commentId)) throw new ToolError("comment_id must be a number");
  const [comment] = await db
    .select({
      id: boardTaskComments.id,
      boardTaskId: boardTaskComments.boardTaskId,
      userId: boardTaskComments.userId,
      body: boardTaskComments.body,
    })
    .from(boardTaskComments)
    .where(and(eq(boardTaskComments.id, commentId), isNull(boardTaskComments.deletedAt)))
    .limit(1);
  if (!comment || comment.boardTaskId == null) throw new ToolError(`Comment ${commentId} not found`);
  const { card, board, caps } = await cardContext(comment.boardTaskId, userId);
  return { comment, card, board, caps };
}

async function pileContext(pileId: number, userId: number) {
  if (!Number.isFinite(pileId)) throw new ToolError("pile_id must be a number");
  const [pile] = await db
    .select({
      id: boardPiles.id,
      boardId: boardPiles.boardId,
      title: boardPiles.title,
      color: boardPiles.color,
      position: boardPiles.position,
    })
    .from(boardPiles)
    .where(and(eq(boardPiles.id, pileId), isNull(boardPiles.deletedAt)))
    .limit(1);
  if (!pile || pile.boardId == null) throw new ToolError(`Pile ${pileId} not found`);
  const { board, caps } = await boardContext(pile.boardId, userId);
  return { pile, board, caps };
}

async function labelContext(labelId: number, userId: number) {
  if (!Number.isFinite(labelId)) throw new ToolError("label_id must be a number");
  const [label] = await db
    .select({
      id: labels.id,
      workspaceId: labels.workspaceId,
      title: labels.title,
      color: labels.color,
    })
    .from(labels)
    .where(and(eq(labels.id, labelId), isNull(labels.deletedAt)))
    .limit(1);
  if (!label || label.workspaceId == null) throw new ToolError(`Label ${labelId} not found`);
  const wsCaps = await loadCapabilities(label.workspaceId, userId);
  return { label, caps: wsCaps };
}

async function columnContext(fieldId: number, userId: number) {
  if (!Number.isFinite(fieldId)) throw new ToolError("field_id must be a number");
  const [col] = await db
    .select({
      id: boardColumns.id,
      boardId: boardColumns.boardId,
      label: boardColumns.label,
      type: boardColumns.type,
      config: boardColumns.config,
      position: boardColumns.position,
    })
    .from(boardColumns)
    .where(and(eq(boardColumns.id, fieldId), isNull(boardColumns.deletedAt)))
    .limit(1);
  if (!col || col.boardId == null) throw new ToolError(`Custom field ${fieldId} not found`);
  const { board, caps } = await boardContext(col.boardId, userId);
  return { col, board, caps };
}

// --- tools ----------------------------------------------------------------

export const TOOLS: McpTool[] = [
  {
    name: "list_workspaces",
    description: "List the workspaces the authenticated user belongs to.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async handler(userId) {
      const rows = await db
        .select({ id: workspaces.id, title: workspaces.title })
        .from(workspaces)
        .innerJoin(workspaceUsers, eq(workspaceUsers.workspaceId, workspaces.id))
        .where(
          and(
            eq(workspaceUsers.userId, userId),
            isNull(workspaceUsers.deletedAt),
            isNull(workspaces.deletedAt),
          ),
        );
      return { workspaces: rows };
    },
  },
  {
    name: "list_boards",
    description:
      "List boards the user can see, optionally filtered to one workspace. Returns id, title and workspace.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: { type: "number", description: "Only boards in this workspace." },
      },
      additionalProperties: false,
    },
    async handler(userId, args) {
      const wsId = args.workspace_id;
      const memberWs = await db
        .select({ id: workspaceUsers.workspaceId })
        .from(workspaceUsers)
        .where(and(eq(workspaceUsers.userId, userId), isNull(workspaceUsers.deletedAt)));
      let wsIds = memberWs.map((r) => r.id);
      if (typeof wsId === "number") wsIds = wsIds.filter((id) => id === wsId);
      if (wsIds.length === 0) return { boards: [] };
      const rows = await db
        .select({
          id: boards.id,
          title: boards.title,
          workspaceId: boards.workspaceId,
        })
        .from(boards)
        .where(and(inArray(boards.workspaceId, wsIds), isNull(boards.deletedAt)))
        .orderBy(asc(boards.id));
      // Filter to boards the user can actually view (board membership / ws admin).
      const visible = [];
      for (const b of rows) {
        const caps = await loadBoardCapabilities(b as LoadedBoardForAccess, userId);
        if (caps.has("view_board")) visible.push(b);
      }
      return { boards: visible };
    },
  },
  {
    name: "get_board",
    description:
      "Get a board's piles (columns) and cards. Each card includes id, title, pile, position, due date and assignees.",
    inputSchema: {
      type: "object",
      properties: { board_id: { type: "number" } },
      required: ["board_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { board } = await boardContext(Number(args.board_id), userId);
      const piles = await db
        .select({ id: boardPiles.id, title: boardPiles.title, position: boardPiles.position })
        .from(boardPiles)
        .where(and(eq(boardPiles.boardId, board.id), isNull(boardPiles.deletedAt)))
        .orderBy(asc(boardPiles.position), asc(boardPiles.id));
      const cards = await db
        .select({
          id: boardTasks.id,
          title: boardTasks.title,
          pileId: boardTasks.pileId,
          position: boardTasks.position,
          dueAt: boardTasks.dueAt,
        })
        .from(boardTasks)
        .where(and(eq(boardTasks.boardId, board.id), isNull(boardTasks.deletedAt)))
        .orderBy(asc(boardTasks.position), asc(boardTasks.id));
      return {
        board: { id: board.id, title: board.title, workspaceId: board.workspaceId },
        piles,
        cards,
      };
    },
  },
  {
    name: "my_cards",
    description: "List cards assigned to the authenticated user across all their boards.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async handler(userId) {
      const rows = await db
        .select({
          id: boardTasks.id,
          title: boardTasks.title,
          dueAt: boardTasks.dueAt,
          boardId: boardTasks.boardId,
          boardTitle: boards.title,
          pileTitle: boardPiles.title,
        })
        .from(boardTaskAssignees)
        .innerJoin(boardTasks, eq(boardTasks.id, boardTaskAssignees.boardTaskId))
        .innerJoin(boards, eq(boards.id, boardTasks.boardId))
        .leftJoin(boardPiles, eq(boardPiles.id, boardTasks.pileId))
        .where(
          and(
            eq(boardTaskAssignees.userId, userId),
            isNull(boardTasks.deletedAt),
            isNull(boards.deletedAt),
          ),
        )
        .orderBy(asc(boardTasks.dueAt));
      return { cards: rows };
    },
  },
  {
    name: "search_cards",
    description:
      "Search cards by title. Scoped to one board if board_id is given, otherwise across all the user's boards.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to match in the card title." },
        board_id: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const q = String(args.query ?? "").trim();
      if (!q) throw new ToolError("query is required");
      let boardIds: number[];
      if (typeof args.board_id === "number") {
        await boardContext(args.board_id, userId); // access check
        boardIds = [args.board_id];
      } else {
        const memberWs = await db
          .select({ id: workspaceUsers.workspaceId })
          .from(workspaceUsers)
          .where(and(eq(workspaceUsers.userId, userId), isNull(workspaceUsers.deletedAt)));
        const wsIds = memberWs.map((r) => r.id);
        if (wsIds.length === 0) return { cards: [] };
        const brds = await db
          .select({ id: boards.id, workspaceId: boards.workspaceId, title: boards.title, createdAt: boards.createdAt })
          .from(boards)
          .where(and(inArray(boards.workspaceId, wsIds), isNull(boards.deletedAt)));
        boardIds = [];
        for (const b of brds) {
          const caps = await loadBoardCapabilities(b as LoadedBoardForAccess, userId);
          if (caps.has("view_board")) boardIds.push(b.id);
        }
        if (boardIds.length === 0) return { cards: [] };
      }
      const rows = await db
        .select({
          id: boardTasks.id,
          title: boardTasks.title,
          boardId: boardTasks.boardId,
          pileId: boardTasks.pileId,
          dueAt: boardTasks.dueAt,
        })
        .from(boardTasks)
        .where(
          and(
            inArray(boardTasks.boardId, boardIds),
            like(boardTasks.title, `%${q}%`),
            isNull(boardTasks.deletedAt),
          ),
        )
        .orderBy(asc(boardTasks.boardId), asc(boardTasks.position))
        .limit(50);
      return { cards: rows };
    },
  },
  {
    name: "create_card",
    description:
      "Create a card on a board. The pile may be a pile id or name; if omitted the first pile is used.",
    inputSchema: {
      type: "object",
      properties: {
        board_id: { type: "number" },
        title: { type: "string" },
        pile: {
          type: ["number", "string"],
          description: "Target pile id or name. Defaults to the first pile.",
        },
      },
      required: ["board_id", "title"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { board, caps } = await boardContext(Number(args.board_id), userId);
      requireCap(caps, "create_card");
      const title = String(args.title ?? "").trim();
      if (!title) throw new ToolError("title is required");
      if (title.length > 255) throw new ToolError("title too long (max 255)");
      const pileId = await resolvePile(board.id, args.pile);
      const [maxRow] = await db
        .select({ value: max(boardTasks.position) })
        .from(boardTasks)
        .where(eq(boardTasks.pileId, pileId));
      const position = (maxRow?.value ?? 0) + 1;
      const now = new Date();
      const [res] = await db.insert(boardTasks).values({
        boardId: board.id,
        pileId,
        title,
        position,
        createdAt: now,
        updatedAt: now,
      });
      const id = Number((res as { insertId: number }).insertId);
      publishBoard(board.id, { type: "card_created", card: { id, title, pileId, position } });
      return { card: { id, title, pileId, position, boardId: board.id } };
    },
  },
  {
    name: "move_card",
    description: "Move a card to a different pile (by pile id or name). Appends it to the end of that pile.",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "number" },
        pile: { type: ["number", "string"], description: "Target pile id or name." },
      },
      required: ["card_id", "pile"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { card, board, caps } = await cardContext(Number(args.card_id), userId);
      requireCap(caps, "edit_card");
      const targetPile = await resolvePile(board.id, args.pile);
      const sourcePile = card.pileId;
      const [maxRow] = await db
        .select({ value: max(boardTasks.position) })
        .from(boardTasks)
        .where(eq(boardTasks.pileId, targetPile));
      const position = (maxRow?.value ?? 0) + 1;
      await db
        .update(boardTasks)
        .set({ pileId: targetPile, position, updatedAt: new Date() })
        .where(eq(boardTasks.id, card.id));
      const order = [{ pileId: targetPile, cardIds: await pileOrder(targetPile) }];
      if (sourcePile != null && sourcePile !== targetPile) {
        order.push({ pileId: sourcePile, cardIds: await pileOrder(sourcePile) });
      }
      publishBoard(board.id, { type: "card_moved", cardId: card.id, pileId: targetPile, order });
      return { card: { id: card.id, pileId: targetPile, position } };
    },
  },
  {
    name: "update_card",
    description:
      "Update a card's title, description and/or due date. Pass due_at as an ISO 8601 string (or null to clear); pass description as plain text (or null to clear).",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "number" },
        title: { type: "string" },
        description: { type: ["string", "null"], description: "Plain text, or null to clear." },
        due_at: { type: ["string", "null"], description: "ISO 8601 datetime, or null to clear." },
      },
      required: ["card_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { card, board, caps } = await cardContext(Number(args.card_id), userId);
      requireCap(caps, "edit_card");
      const patch: { title?: string; description?: string | null; dueAt?: Date | null; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      const event: { type: "card_updated"; cardId: number; title?: string; dueAt?: string | null } = {
        type: "card_updated",
        cardId: card.id,
      };
      if (typeof args.title === "string") {
        const t = args.title.trim();
        if (!t) throw new ToolError("title cannot be empty");
        if (t.length > 255) throw new ToolError("title too long (max 255)");
        patch.title = t;
        event.title = t;
      }
      if ("description" in args) {
        if (args.description === null || args.description === "") {
          patch.description = null;
        } else if (typeof args.description === "string") {
          if (args.description.length > 20000) throw new ToolError("description too long (max 20000)");
          patch.description = args.description;
        } else {
          throw new ToolError("description must be a string or null");
        }
      }
      if ("due_at" in args) {
        if (args.due_at === null) {
          patch.dueAt = null;
          event.dueAt = null;
        } else if (typeof args.due_at === "string") {
          const d = new Date(args.due_at);
          if (Number.isNaN(d.getTime())) throw new ToolError("due_at is not a valid date");
          patch.dueAt = d;
          event.dueAt = d.toISOString();
        }
      }
      if (patch.title === undefined && patch.description === undefined && patch.dueAt === undefined) {
        throw new ToolError("Nothing to update: pass title, description and/or due_at");
      }
      await db.update(boardTasks).set(patch).where(eq(boardTasks.id, card.id));
      publishBoard(board.id, event);
      return { card: { id: card.id, ...("title" in event ? { title: event.title } : {}) } };
    },
  },
  {
    name: "add_comment",
    description: "Post a comment on a card. Available to anyone who can view the board.",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "number" },
        body: { type: "string" },
      },
      required: ["card_id", "body"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { card } = await cardContext(Number(args.card_id), userId);
      // view_board is already enforced by cardContext; comments need nothing more.
      const body = String(args.body ?? "").trim();
      if (!body) throw new ToolError("body is required");
      if (body.length > 5000) throw new ToolError("comment too long (max 5000)");
      const now = new Date();
      const [res] = await db.insert(boardTaskComments).values({
        boardTaskId: card.id,
        userId,
        body,
        createdAt: now,
        updatedAt: now,
      });
      return { comment: { id: Number((res as { insertId: number }).insertId), cardId: card.id } };
    },
  },
  {
    name: "list_board_members",
    description:
      "List the members of a board (with user id, name and email) so you can resolve who to assign to a card.",
    inputSchema: {
      type: "object",
      properties: { board_id: { type: "number" } },
      required: ["board_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { board } = await boardContext(Number(args.board_id), userId);
      const rows = await db
        .select({
          userId: boardUsers.userId,
          firstname: users.firstname,
          lastname: users.lastname,
          email: users.email,
          boardRoleId: boardUsers.boardRoleId,
        })
        .from(boardUsers)
        .innerJoin(users, eq(users.id, boardUsers.userId))
        .where(
          and(
            eq(boardUsers.boardId, board.id),
            isNull(boardUsers.deletedAt),
            isNull(users.deletedAt),
          ),
        );
      return { members: rows };
    },
  },
  {
    name: "list_labels",
    description:
      "List the labels available for a board's workspace (id, title, color) so you can resolve which to add to a card.",
    inputSchema: {
      type: "object",
      properties: {
        board_id: { type: "number", description: "Resolve labels from this board's workspace." },
        workspace_id: { type: "number" },
      },
      additionalProperties: false,
    },
    async handler(userId, args) {
      let workspaceId: number;
      if (typeof args.board_id === "number") {
        const { board } = await boardContext(args.board_id, userId);
        workspaceId = board.workspaceId as number;
      } else if (typeof args.workspace_id === "number") {
        const [member] = await db
          .select({ id: workspaceUsers.userId })
          .from(workspaceUsers)
          .where(
            and(
              eq(workspaceUsers.workspaceId, args.workspace_id),
              eq(workspaceUsers.userId, userId),
              isNull(workspaceUsers.deletedAt),
            ),
          )
          .limit(1);
        if (!member) throw new ToolError("No access to that workspace");
        workspaceId = args.workspace_id;
      } else {
        throw new ToolError("Provide board_id or workspace_id");
      }
      const rows = await db
        .select({ id: labels.id, title: labels.title, color: labels.color })
        .from(labels)
        .where(and(eq(labels.workspaceId, workspaceId), isNull(labels.deletedAt)))
        .orderBy(asc(labels.position), asc(labels.id));
      return { labels: rows };
    },
  },
  {
    name: "create_label",
    description:
      "Create a new label in a workspace (so it can then be added to cards). Requires the manage_labels capability. " +
      `Valid colors: ${Array.from(ALLOWED_COLORS).join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: {
        board_id: { type: "number", description: "Create the label in this board's workspace." },
        workspace_id: { type: "number" },
        title: { type: "string" },
        color: { type: "string", description: "One of the valid palette colors. Defaults to slate." },
      },
      required: ["title"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      // Resolve the target workspace from board_id or workspace_id.
      let workspaceId: number;
      if (typeof args.board_id === "number") {
        const { board } = await boardContext(args.board_id, userId);
        workspaceId = board.workspaceId as number;
      } else if (typeof args.workspace_id === "number") {
        workspaceId = args.workspace_id;
      } else {
        throw new ToolError("Provide board_id or workspace_id");
      }
      const caps = await loadCapabilities(workspaceId, userId);
      requireCap(caps, "manage_labels");

      const title = String(args.title ?? "").trim();
      if (!title) throw new ToolError("title is required");
      if (title.length > 50) throw new ToolError("title too long (max 50)");
      const color = args.color == null || args.color === "" ? "slate" : String(args.color);
      if (!(ALLOWED_COLORS as ReadonlySet<string>).has(color)) {
        throw new ToolError(`Unknown color "${color}". Valid: ${Array.from(ALLOWED_COLORS).join(", ")}`);
      }

      const [maxRow] = await db
        .select({ value: max(labels.position) })
        .from(labels)
        .where(eq(labels.workspaceId, workspaceId));
      const position = (maxRow?.value ?? 0) + 1;
      const now = new Date();
      const [res] = await db.insert(labels).values({
        workspaceId,
        title,
        color,
        position,
        isDefault: 0,
        createdAt: now,
        updatedAt: now,
      });
      return {
        label: { id: Number((res as { insertId: number }).insertId), title, color, workspaceId },
      };
    },
  },
  {
    name: "get_card",
    description:
      "Get a single card in full: title, description, pile, due date, assignees, labels, sub-tasks and comment count.",
    inputSchema: {
      type: "object",
      properties: { card_id: { type: "number" } },
      required: ["card_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { card } = await cardContext(Number(args.card_id), userId);
      const assignees = await db
        .select({
          userId: users.id,
          firstname: users.firstname,
          lastname: users.lastname,
          email: users.email,
        })
        .from(boardTaskAssignees)
        .innerJoin(users, eq(users.id, boardTaskAssignees.userId))
        .where(eq(boardTaskAssignees.boardTaskId, card.id));
      const cardLabels = await db
        .select({ id: labels.id, title: labels.title, color: labels.color })
        .from(boardTaskLabels)
        .innerJoin(labels, eq(labels.id, boardTaskLabels.labelId))
        .where(eq(boardTaskLabels.boardTaskId, card.id));
      const items = await db
        .select({ id: boardTaskItems.id, title: boardTaskItems.title, done: boardTaskItems.done })
        .from(boardTaskItems)
        .where(and(eq(boardTaskItems.boardTaskId, card.id), isNull(boardTaskItems.deletedAt)))
        .orderBy(asc(boardTaskItems.position), asc(boardTaskItems.id));
      const comments = await db
        .select({ id: boardTaskComments.id })
        .from(boardTaskComments)
        .where(and(eq(boardTaskComments.boardTaskId, card.id), isNull(boardTaskComments.deletedAt)));
      const fieldValues = await db
        .select({
          fieldId: boardTaskColumns.boardColumnId,
          value: boardTaskColumns.value,
          label: boardColumns.label,
          type: boardColumns.type,
        })
        .from(boardTaskColumns)
        .innerJoin(boardColumns, eq(boardColumns.id, boardTaskColumns.boardColumnId))
        .where(
          and(
            eq(boardTaskColumns.boardTaskId, card.id),
            isNull(boardTaskColumns.deletedAt),
            isNull(boardColumns.deletedAt),
          ),
        );
      return {
        card: {
          id: card.id,
          title: card.title,
          description: card.description,
          boardId: card.boardId,
          pileId: card.pileId,
          dueAt: card.dueAt,
          assignees,
          labels: cardLabels,
          subtasks: items.map((i) => ({ id: i.id, title: i.title, done: i.done === 1 })),
          commentCount: comments.length,
          fields: fieldValues.map((f) => ({
            fieldId: f.fieldId,
            label: f.label,
            type: f.type,
            value: parseValue(f.value),
          })),
        },
      };
    },
  },
  {
    name: "assign_card",
    description:
      "Add and/or remove assignees on a card by user id. Pass `add` and/or `remove` arrays, or `set` to replace the whole list. Only board members can be assigned.",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "number" },
        add: { type: "array", items: { type: "number" }, description: "User ids to assign." },
        remove: { type: "array", items: { type: "number" }, description: "User ids to unassign." },
        set: { type: "array", items: { type: "number" }, description: "Replace assignees with exactly these user ids." },
      },
      required: ["card_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { card, board, caps } = await cardContext(Number(args.card_id), userId);
      requireCap(caps, "edit_card");
      const current = (
        await db
          .select({ userId: boardTaskAssignees.userId })
          .from(boardTaskAssignees)
          .where(eq(boardTaskAssignees.boardTaskId, card.id))
      ).map((r) => r.userId);
      const target = resolveIdSet(current, args);

      if (target.length > 0) {
        // Eligible = explicit board members + workspace admins.
        const members = await db
          .select({ userId: boardUsers.userId })
          .from(boardUsers)
          .where(
            and(
              eq(boardUsers.boardId, board.id),
              inArray(boardUsers.userId, target),
              isNull(boardUsers.deletedAt),
            ),
          );
        const admins = await db
          .select({ userId: workspaceUsers.userId })
          .from(workspaceUsers)
          .where(
            and(
              eq(workspaceUsers.workspaceId, board.workspaceId as number),
              eq(workspaceUsers.workspaceRoleId, WORKSPACE_ADMIN_ROLE_ID),
              inArray(workspaceUsers.userId, target),
              isNull(workspaceUsers.deletedAt),
            ),
          );
        const eligible = new Set([...members, ...admins].map((r) => r.userId));
        const bad = target.filter((u) => !eligible.has(u));
        if (bad.length > 0) {
          throw new ToolError(`Not board members, can't assign: ${bad.join(", ")}`);
        }
      }

      const added = target.filter((u) => !current.includes(u));
      await db.delete(boardTaskAssignees).where(eq(boardTaskAssignees.boardTaskId, card.id));
      if (target.length > 0) {
        const now = new Date();
        await db
          .insert(boardTaskAssignees)
          .values(target.map((u) => ({ boardTaskId: card.id, userId: u, createdAt: now })));
      }
      let roster: BoardAssignee[] = [];
      if (target.length > 0) {
        roster = await db
          .select({
            userId: users.id,
            firstname: users.firstname,
            lastname: users.lastname,
            email: users.email,
          })
          .from(users)
          .where(inArray(users.id, target));
      }
      publishBoard(board.id, { type: "card_assignees", cardId: card.id, assignees: roster });
      if (added.length > 0) {
        await emitNotifications(
          added.map((u) => ({
            userId: u,
            type: "card_assigned",
            actorUserId: userId,
            cardId: card.id,
            boardId: board.id,
            workspaceId: board.workspaceId as number,
          })),
        );
      }
      return { card: { id: card.id, assignees: target } };
    },
  },
  {
    name: "set_card_labels",
    description:
      "Add and/or remove labels on a card by label id. Pass `add` and/or `remove` arrays, or `set` to replace the whole list. Use list_labels to find ids.",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "number" },
        add: { type: "array", items: { type: "number" } },
        remove: { type: "array", items: { type: "number" } },
        set: { type: "array", items: { type: "number" } },
      },
      required: ["card_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { card, board, caps } = await cardContext(Number(args.card_id), userId);
      requireCap(caps, "edit_card");
      const current = (
        await db
          .select({ labelId: boardTaskLabels.labelId })
          .from(boardTaskLabels)
          .where(eq(boardTaskLabels.boardTaskId, card.id))
      ).map((r) => r.labelId);
      const target = resolveIdSet(current, args);

      if (target.length > 0) {
        const valid = await db
          .select({ id: labels.id })
          .from(labels)
          .where(
            and(
              eq(labels.workspaceId, board.workspaceId as number),
              inArray(labels.id, target),
              isNull(labels.deletedAt),
            ),
          );
        const validIds = new Set(valid.map((l) => l.id));
        const bad = target.filter((id) => !validIds.has(id));
        if (bad.length > 0) {
          throw new ToolError(`Labels not in this workspace: ${bad.join(", ")}`);
        }
      }

      await db.delete(boardTaskLabels).where(eq(boardTaskLabels.boardTaskId, card.id));
      if (target.length > 0) {
        const now = new Date();
        await db
          .insert(boardTaskLabels)
          .values(target.map((labelId) => ({ boardTaskId: card.id, labelId, createdAt: now })));
      }
      publishBoard(board.id, { type: "card_labels", cardId: card.id, labelIds: target });
      return { card: { id: card.id, labelIds: target } };
    },
  },
  {
    name: "add_subtask",
    description: "Add a sub-task (checklist item) to a card.",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "number" },
        title: { type: "string" },
      },
      required: ["card_id", "title"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { card, board, caps } = await cardContext(Number(args.card_id), userId);
      requireCap(caps, "edit_card");
      const title = String(args.title ?? "").trim();
      if (!title) throw new ToolError("title is required");
      if (title.length > 255) throw new ToolError("title too long (max 255)");
      const [maxRow] = await db
        .select({ value: max(boardTaskItems.position) })
        .from(boardTaskItems)
        .where(eq(boardTaskItems.boardTaskId, card.id));
      const position = (maxRow?.value ?? 0) + 1;
      const now = new Date();
      const [res] = await db.insert(boardTaskItems).values({
        boardTaskId: card.id,
        title,
        done: 0,
        position,
        createdAt: now,
        updatedAt: now,
      });
      await publishCardCounts(board.id, card.id);
      return { subtask: { id: Number((res as { insertId: number }).insertId), title, done: false } };
    },
  },
  {
    name: "update_subtask",
    description:
      "Rename a sub-task and/or mark it done/undone. Pass title and/or done. Use the sub-task id from get_card.",
    inputSchema: {
      type: "object",
      properties: {
        subtask_id: { type: "number" },
        title: { type: "string" },
        done: { type: "boolean" },
      },
      required: ["subtask_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { item, board, card, caps } = await itemContext(Number(args.subtask_id), userId);
      requireCap(caps, "edit_card");
      const patch: { title?: string; done?: number; updatedAt: Date } = { updatedAt: new Date() };
      if (typeof args.title === "string") {
        const t = args.title.trim();
        if (!t) throw new ToolError("title cannot be empty");
        if (t.length > 255) throw new ToolError("title too long (max 255)");
        patch.title = t;
      }
      if (typeof args.done === "boolean") patch.done = args.done ? 1 : 0;
      if (patch.title === undefined && patch.done === undefined) {
        throw new ToolError("Nothing to update: pass title and/or done");
      }
      await db.update(boardTaskItems).set(patch).where(eq(boardTaskItems.id, item.id));
      // Only the done state moves the card's progress badge.
      if (patch.done !== undefined) await publishCardCounts(board.id, card.id);
      return {
        subtask: {
          id: item.id,
          title: patch.title ?? item.title,
          done: patch.done !== undefined ? patch.done === 1 : item.done === 1,
        },
      };
    },
  },
  {
    name: "delete_subtask",
    description: "Delete a sub-task (checklist item) from its card.",
    inputSchema: {
      type: "object",
      properties: { subtask_id: { type: "number" } },
      required: ["subtask_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { item, board, card, caps } = await itemContext(Number(args.subtask_id), userId);
      requireCap(caps, "edit_card");
      await db
        .update(boardTaskItems)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(boardTaskItems.id, item.id));
      await publishCardCounts(board.id, card.id);
      return { deleted: item.id };
    },
  },
  {
    name: "delete_card",
    description: "Delete a card. Requires the delete_card board capability.",
    inputSchema: {
      type: "object",
      properties: { card_id: { type: "number" } },
      required: ["card_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { card, board, caps } = await cardContext(Number(args.card_id), userId);
      requireCap(caps, "delete_card");
      await db
        .update(boardTasks)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(boardTasks.id, card.id));
      publishBoard(board.id, { type: "card_deleted", cardId: card.id });
      return { deleted: card.id };
    },
  },

  // ── Comments ──────────────────────────────────────────────────────────────

  {
    name: "list_comments",
    description:
      "List all comments on a card, ordered oldest-first. " +
      "Returns id, body, author (userId, firstname, lastname, email), createdAt, updatedAt. " +
      "Available to anyone with view_board access.",
    inputSchema: {
      type: "object",
      properties: { card_id: { type: "number" } },
      required: ["card_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { card } = await cardContext(Number(args.card_id), userId);
      const rows = await db
        .select({
          id: boardTaskComments.id,
          body: boardTaskComments.body,
          createdAt: boardTaskComments.createdAt,
          updatedAt: boardTaskComments.updatedAt,
          authorId: users.id,
          firstname: users.firstname,
          lastname: users.lastname,
          email: users.email,
        })
        .from(boardTaskComments)
        .innerJoin(users, eq(users.id, boardTaskComments.userId))
        .where(and(eq(boardTaskComments.boardTaskId, card.id), isNull(boardTaskComments.deletedAt)))
        .orderBy(asc(boardTaskComments.createdAt), asc(boardTaskComments.id));
      return { comments: rows };
    },
  },
  {
    name: "edit_comment",
    description:
      "Edit the body of a comment. You may only edit your own comments unless you have the " +
      "manage_board_members capability (board/workspace admin). Body max 5000 chars.",
    inputSchema: {
      type: "object",
      properties: {
        comment_id: { type: "number" },
        body: { type: "string", description: "New comment text (max 5000 chars)." },
      },
      required: ["comment_id", "body"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { comment, caps } = await commentContext(Number(args.comment_id), userId);
      const isOwn = comment.userId === userId;
      const isAdmin = caps.has("manage_board_members");
      if (!isOwn && !isAdmin) throw new ToolError("You can only edit your own comments");
      const body = String(args.body ?? "").trim();
      if (!body) throw new ToolError("body is required");
      if (body.length > 5000) throw new ToolError("comment too long (max 5000)");
      const now = new Date();
      await db
        .update(boardTaskComments)
        .set({ body, updatedAt: now })
        .where(eq(boardTaskComments.id, comment.id));
      publishCard(comment.boardTaskId, {
        type: "comment_updated",
        commentId: comment.id,
        body,
        updatedAt: now.toISOString(),
      });
      return { comment: { id: comment.id, body } };
    },
  },
  {
    name: "delete_comment",
    description:
      "Delete a comment. You may only delete your own comments unless you have the " +
      "manage_board_members capability (board/workspace admin).",
    inputSchema: {
      type: "object",
      properties: { comment_id: { type: "number" } },
      required: ["comment_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { comment, board, caps } = await commentContext(Number(args.comment_id), userId);
      const isOwn = comment.userId === userId;
      const isAdmin = caps.has("manage_board_members");
      if (!isOwn && !isAdmin) throw new ToolError("You can only delete your own comments");
      await db
        .update(boardTaskComments)
        .set({ deletedAt: new Date() })
        .where(eq(boardTaskComments.id, comment.id));
      publishCard(comment.boardTaskId, { type: "comment_deleted", commentId: comment.id });
      await publishCardCounts(board.id, comment.boardTaskId);
      return { deleted: comment.id };
    },
  },

  // ── Piles ─────────────────────────────────────────────────────────────────

  {
    name: "create_pile",
    description:
      "Create a new pile (column) on a board. Requires the manage_piles board capability. " +
      "Title max 60 chars; optional color from the palette " +
      `(${Array.from(ALLOWED_COLORS).join(", ")}).`,
    inputSchema: {
      type: "object",
      properties: {
        board_id: { type: "number" },
        title: { type: "string", description: "Pile title (max 60 chars)." },
        color: {
          type: "string",
          description: `Optional pile color. One of: ${Array.from(ALLOWED_COLORS).join(", ")}.`,
        },
      },
      required: ["board_id", "title"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { board, caps } = await boardContext(Number(args.board_id), userId);
      requireCap(caps, "manage_piles");
      const title = String(args.title ?? "").trim();
      if (!title) throw new ToolError("title is required");
      if (title.length > 60) throw new ToolError("title too long (max 60)");
      let color: string | null = null;
      if (typeof args.color === "string" && args.color.trim()) {
        if (!(ALLOWED_COLORS as ReadonlySet<string>).has(args.color)) {
          throw new ToolError(`Unknown color "${args.color}". Valid: ${Array.from(ALLOWED_COLORS).join(", ")}`);
        }
        color = args.color;
      }
      const [maxRow] = await db
        .select({ value: max(boardPiles.position) })
        .from(boardPiles)
        .where(eq(boardPiles.boardId, board.id));
      const position = (maxRow?.value ?? 0) + 1;
      const now = new Date();
      const [res] = await db.insert(boardPiles).values({
        boardId: board.id, title, color, position, createdAt: now, updatedAt: now,
      });
      const pileId = Number((res as { insertId: number }).insertId);
      publishBoard(board.id, { type: "pile_created", pile: { id: pileId, title, color, position } });
      return { pile: { id: pileId, title, color, position, boardId: board.id } };
    },
  },
  {
    name: "update_pile",
    description:
      "Rename a pile and/or change its color. Requires the manage_piles board capability. " +
      `Valid colors: ${Array.from(ALLOWED_COLORS).join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: {
        pile_id: { type: "number" },
        title: { type: "string", description: "New title (max 60 chars)." },
        color: {
          type: ["string", "null"],
          description: `Palette color name, or null to clear. Valid: ${Array.from(ALLOWED_COLORS).join(", ")}.`,
        },
      },
      required: ["pile_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { pile, board, caps } = await pileContext(Number(args.pile_id), userId);
      requireCap(caps, "manage_piles");
      const updates: { title?: string; color?: string | null } = {};
      if (typeof args.title === "string") {
        const t = args.title.trim();
        if (!t) throw new ToolError("title cannot be empty");
        if (t.length > 60) throw new ToolError("title too long (max 60)");
        updates.title = t;
      }
      if ("color" in args) {
        if (args.color === null || args.color === "") {
          updates.color = null;
        } else if (typeof args.color === "string") {
          if (!(ALLOWED_COLORS as ReadonlySet<string>).has(args.color)) {
            throw new ToolError(`Unknown color "${args.color}". Valid: ${Array.from(ALLOWED_COLORS).join(", ")}`);
          }
          updates.color = args.color;
        }
      }
      if (Object.keys(updates).length === 0) {
        throw new ToolError("Nothing to update: pass title and/or color");
      }
      await db
        .update(boardPiles)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(boardPiles.id, pile.id));
      if (updates.title !== undefined) {
        publishBoard(board.id, { type: "pile_updated", pileId: pile.id, title: updates.title });
      }
      return { pile: { id: pile.id, ...updates } };
    },
  },
  {
    name: "delete_pile",
    description:
      "Delete a pile (column) from a board. The pile must be empty — use move_card first if it has cards. " +
      "Requires the manage_piles board capability.",
    inputSchema: {
      type: "object",
      properties: { pile_id: { type: "number" } },
      required: ["pile_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { pile, board, caps } = await pileContext(Number(args.pile_id), userId);
      requireCap(caps, "manage_piles");
      const [nonEmpty] = await db
        .select({ id: boardTasks.id })
        .from(boardTasks)
        .where(and(eq(boardTasks.pileId, pile.id), isNull(boardTasks.deletedAt)))
        .limit(1);
      if (nonEmpty) throw new ToolError("Pile is not empty. Move its cards first.");
      await db
        .update(boardPiles)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(boardPiles.id, pile.id));
      publishBoard(board.id, { type: "pile_deleted", pileId: pile.id });
      return { deleted: pile.id };
    },
  },

  // ── Boards ────────────────────────────────────────────────────────────────

  {
    name: "create_board",
    description:
      "Create a new board in a workspace. Requires the create_board workspace capability. " +
      "The caller is automatically added as board_admin. " +
      "The board is created with three default piles: To do, In progress, Done.",
    inputSchema: {
      type: "object",
      properties: {
        workspace_id: { type: "number" },
        title: { type: "string", description: "Board title (max 100 chars)." },
      },
      required: ["workspace_id", "title"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const wsId = Number(args.workspace_id);
      if (!Number.isFinite(wsId)) throw new ToolError("workspace_id must be a number");
      const caps = await loadCapabilities(wsId, userId);
      requireCap(caps, "create_board");
      const title = String(args.title ?? "").trim();
      if (!title) throw new ToolError("title is required");
      if (title.length > 100) throw new ToolError("title too long (max 100)");
      const now = new Date();
      const [res] = await db.insert(boards).values({ workspaceId: wsId, title, createdAt: now });
      const boardId = Number((res as { insertId: number }).insertId);
      const defaultPiles = [
        { title: "To do", color: "slate" },
        { title: "In progress", color: "amber" },
        { title: "Done", color: "lime" },
      ];
      await db.insert(boardPiles).values(
        defaultPiles.map((p, idx) => ({
          boardId, title: p.title, color: p.color, position: idx + 1, createdAt: now, updatedAt: now,
        })),
      );
      await db.insert(boardUsers).values({
        boardId, userId, boardRoleId: BOARD_ADMIN_ROLE_ID, createdAt: now,
      });
      return { board: { id: boardId, title, workspaceId: wsId } };
    },
  },
  {
    name: "update_board",
    description: "Rename a board. Requires the edit_board board capability. Title max 100 chars.",
    inputSchema: {
      type: "object",
      properties: {
        board_id: { type: "number" },
        title: { type: "string", description: "New board title (max 100 chars)." },
      },
      required: ["board_id", "title"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { board, caps } = await boardContext(Number(args.board_id), userId);
      requireCap(caps, "edit_board");
      const title = String(args.title ?? "").trim();
      if (!title) throw new ToolError("title cannot be empty");
      if (title.length > 100) throw new ToolError("title too long (max 100)");
      await db.update(boards).set({ title }).where(eq(boards.id, board.id));
      return { board: { id: board.id, title } };
    },
  },
  {
    name: "delete_board",
    description:
      "Permanently delete a board and all its content (piles, cards, comments, sub-tasks, labels). " +
      "This is irreversible. Requires the delete_board board capability (board_admin or workspace_admin).",
    inputSchema: {
      type: "object",
      properties: { board_id: { type: "number" } },
      required: ["board_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { board, caps } = await boardContext(Number(args.board_id), userId);
      requireCap(caps, "delete_board");
      const taskRows = await db
        .select({ id: boardTasks.id })
        .from(boardTasks)
        .where(eq(boardTasks.boardId, board.id));
      const taskIds = taskRows.map((t) => t.id);
      await db.transaction(async (tx) => {
        if (taskIds.length) {
          await tx.delete(boardTaskAttachments).where(inArray(boardTaskAttachments.boardTaskId, taskIds));
          await tx.delete(boardTaskItems).where(inArray(boardTaskItems.boardTaskId, taskIds));
          await tx.delete(boardTaskLabels).where(inArray(boardTaskLabels.boardTaskId, taskIds));
          await tx.delete(boardTaskAssignees).where(inArray(boardTaskAssignees.boardTaskId, taskIds));
          await tx.delete(boardTaskComments).where(inArray(boardTaskComments.boardTaskId, taskIds));
        }
        await tx.delete(boardTasks).where(eq(boardTasks.boardId, board.id));
        await tx.delete(boardPiles).where(eq(boardPiles.boardId, board.id));
        await tx.delete(notifications).where(eq(notifications.boardId, board.id));
        await tx.delete(boards).where(eq(boards.id, board.id));
      });
      return { deleted: board.id };
    },
  },

  // ── Custom fields ─────────────────────────────────────────────────────────

  {
    name: "list_custom_fields",
    description:
      "List the custom field definitions on a board (id, label, type, config, position). " +
      "Use this before calling set_card_field to resolve field ids and valid options. " +
      `Types: ${FIELD_TYPES.join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: { board_id: { type: "number" } },
      required: ["board_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { board } = await boardContext(Number(args.board_id), userId);
      const rows = await db
        .select({
          id: boardColumns.id,
          label: boardColumns.label,
          type: boardColumns.type,
          config: boardColumns.config,
          position: boardColumns.position,
        })
        .from(boardColumns)
        .where(and(eq(boardColumns.boardId, board.id), isNull(boardColumns.deletedAt)))
        .orderBy(asc(boardColumns.position), asc(boardColumns.id));
      return {
        fields: rows.map((r) => ({ ...r, config: parseConfig(r.config) })),
      };
    },
  },
  {
    name: "create_custom_field",
    description:
      "Create a new custom field definition on a board. Requires the edit_board capability. " +
      `Types: ${FIELD_TYPES.join(", ")}. ` +
      "For select/multi_select, pass config as { options: [{ label, color? }] }.",
    inputSchema: {
      type: "object",
      properties: {
        board_id: { type: "number" },
        label: { type: "string", description: "Field name (max 60 chars)." },
        type: {
          type: "string",
          description: `Field type. One of: ${FIELD_TYPES.join(", ")}.`,
        },
        config: {
          type: "object",
          description: "For select/multi_select only: { options: [{ label, color? }] }.",
        },
      },
      required: ["board_id", "label", "type"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { board, caps } = await boardContext(Number(args.board_id), userId);
      requireCap(caps, "edit_board");
      const label = String(args.label ?? "").trim();
      if (!label) throw new ToolError("label is required");
      if (label.length > 60) throw new ToolError("label too long (max 60)");
      if (!isFieldType(args.type)) {
        throw new ToolError(`Unknown type "${args.type}". Valid: ${FIELD_TYPES.join(", ")}`);
      }
      const config = normalizeConfig(args.type, args.config ?? null);
      const [maxRow] = await db
        .select({ value: max(boardColumns.position) })
        .from(boardColumns)
        .where(eq(boardColumns.boardId, board.id));
      const position = (maxRow?.value ?? 0) + 1;
      const [res] = await db.insert(boardColumns).values({
        boardId: board.id,
        label,
        type: args.type,
        config,
        position,
      });
      const id = Number((res as { insertId: number }).insertId);
      return { field: { id, label, type: args.type, config, position, boardId: board.id } };
    },
  },
  {
    name: "delete_custom_field",
    description:
      "Delete a custom field definition from a board. All card values for this field will also be removed. " +
      "Requires the edit_board capability.",
    inputSchema: {
      type: "object",
      properties: { field_id: { type: "number" } },
      required: ["field_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { col, caps } = await columnContext(Number(args.field_id), userId);
      requireCap(caps, "edit_board");
      await db
        .update(boardColumns)
        .set({ deletedAt: new Date() })
        .where(eq(boardColumns.id, col.id));
      return { deleted: col.id };
    },
  },
  {
    name: "set_card_field",
    description:
      "Set or clear a custom field value on a card. Requires the edit_card capability. " +
      "Pass null to clear the value. " +
      "For select, value must be an option id string (use list_custom_fields to see options). " +
      "For multi_select, value must be an array of option id strings. " +
      "For date, value must be an ISO 8601 string. " +
      "For checkbox, value must be a boolean.",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "number" },
        field_id: { type: "number", description: "Custom field id (from list_custom_fields)." },
        value: { description: "The value to set, or null to clear." },
      },
      required: ["card_id", "field_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { card, caps } = await cardContext(Number(args.card_id), userId);
      requireCap(caps, "edit_card");
      const fieldId = Number(args.field_id);
      if (!Number.isFinite(fieldId)) throw new ToolError("field_id must be a number");

      const [col] = await db
        .select({
          id: boardColumns.id,
          boardId: boardColumns.boardId,
          type: boardColumns.type,
          config: boardColumns.config,
        })
        .from(boardColumns)
        .where(and(eq(boardColumns.id, fieldId), isNull(boardColumns.deletedAt)))
        .limit(1);
      if (!col || col.boardId !== card.boardId) {
        throw new ToolError("Custom field not found on this board");
      }

      const result = coerceValue(
        col.type as Parameters<typeof coerceValue>[0],
        "value" in args ? args.value : null,
        parseConfig(col.config),
      );
      if (!result.ok) throw new ToolError(result.error);

      if (result.value === null) {
        await db
          .delete(boardTaskColumns)
          .where(
            and(
              eq(boardTaskColumns.boardColumnId, fieldId),
              eq(boardTaskColumns.boardTaskId, card.id),
            ),
          );
        return { card: { id: card.id }, field: { id: fieldId, value: null } };
      }

      await db
        .insert(boardTaskColumns)
        .values({ boardColumnId: fieldId, boardTaskId: card.id, value: result.value })
        .onDuplicateKeyUpdate({ set: { value: result.value } });

      return { card: { id: card.id }, field: { id: fieldId, value: result.value } };
    },
  },

  // ── Labels ────────────────────────────────────────────────────────────────

  {
    name: "update_label",
    description:
      "Rename a label and/or change its color. Requires the manage_labels workspace capability. " +
      `Valid colors: ${Array.from(ALLOWED_COLORS).join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: {
        label_id: { type: "number" },
        title: { type: "string", description: "New label title (max 50 chars)." },
        color: {
          type: "string",
          description: `Palette color name. Valid: ${Array.from(ALLOWED_COLORS).join(", ")}.`,
        },
      },
      required: ["label_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { label, caps } = await labelContext(Number(args.label_id), userId);
      requireCap(caps, "manage_labels");
      const updates: { title?: string; color?: string } = {};
      if (typeof args.title === "string") {
        const t = args.title.trim();
        if (!t) throw new ToolError("title cannot be empty");
        if (t.length > 50) throw new ToolError("title too long (max 50)");
        updates.title = t;
      }
      if (typeof args.color === "string") {
        if (!(ALLOWED_COLORS as ReadonlySet<string>).has(args.color)) {
          throw new ToolError(`Unknown color "${args.color}". Valid: ${Array.from(ALLOWED_COLORS).join(", ")}`);
        }
        updates.color = args.color;
      }
      if (Object.keys(updates).length === 0) {
        throw new ToolError("Nothing to update: pass title and/or color");
      }
      await db
        .update(labels)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(labels.id, label.id));
      return { label: { id: label.id, ...updates } };
    },
  },
  {
    name: "delete_label",
    description:
      "Delete a label from a workspace. It will be removed from all cards that use it. " +
      "Requires the manage_labels workspace capability.",
    inputSchema: {
      type: "object",
      properties: { label_id: { type: "number" } },
      required: ["label_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { label, caps } = await labelContext(Number(args.label_id), userId);
      requireCap(caps, "manage_labels");
      await db
        .update(labels)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(labels.id, label.id));
      return { deleted: label.id };
    },
  },
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Run a tool, surfacing validation/permission failures as readable errors. */
export async function runTool(
  name: string,
  userId: number,
  args: Record<string, unknown>,
): Promise<unknown> {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) throw new ToolError(`Unknown tool: ${name}`);
  return tool.handler(userId, args ?? {});
}

export { ToolError };
