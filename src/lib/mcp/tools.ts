import { and, asc, eq, inArray, isNull, like, max } from "drizzle-orm";
import { db } from "@/db/client";
import {
  boardPiles,
  boards,
  boardTaskAssignees,
  boardTaskComments,
  boardTaskItems,
  boardTaskLabels,
  boardTasks,
  boardUsers,
  labels,
  users,
  workspaces,
  workspaceUsers,
} from "@/db/schema";
import {
  loadBoardCapabilities,
  type LoadedBoardForAccess,
} from "@/lib/board-access";
import { WORKSPACE_ADMIN_ROLE_ID } from "@/lib/workspace-access";
import { publishBoard, type BoardAssignee } from "@/lib/board-bus";
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
    description: "Update a card's title and/or due date. Pass due_at as an ISO 8601 string, or null to clear it.",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "number" },
        title: { type: "string" },
        due_at: { type: ["string", "null"], description: "ISO 8601 datetime, or null to clear." },
      },
      required: ["card_id"],
      additionalProperties: false,
    },
    async handler(userId, args) {
      const { card, board, caps } = await cardContext(Number(args.card_id), userId);
      requireCap(caps, "edit_card");
      const patch: { title?: string; dueAt?: Date | null; updatedAt: Date } = { updatedAt: new Date() };
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
      if (patch.title === undefined && patch.dueAt === undefined) {
        throw new ToolError("Nothing to update: pass title and/or due_at");
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
    name: "delete_card",
    description: "Delete a card. Requires the delete_card capability.",
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
