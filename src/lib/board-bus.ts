/**
 * Module-singleton pub/sub for per-board events. Lets every open
 * kanban view stay in sync — card created/moved/deleted/edited and
 * pile created/renamed/deleted — without polling. Mirrors card-bus.ts
 * but keyed by boardId. Single Node process only; swap the channel map
 * for Redis pub/sub or NATS when we scale out.
 *
 * Every event carries enough authoritative data to be applied
 * idempotently, so the originating client re-applying its own echo is
 * harmless. That lets us skip any client-id bookkeeping.
 */

export type BoardPileSummary = {
  id: number;
  title: string;
  color: string | null;
  position: number;
};

export type BoardCardSummary = {
  id: number;
  title: string | null;
  pileId: number | null;
  position: number | null;
};

export type BoardAssignee = {
  userId: number;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
};

/** Ordered card ids for a pile, used to re-pack positions after a move. */
export type PileOrder = { pileId: number; cardIds: number[] };

export type BoardEvent =
  | { type: "card_created"; card: BoardCardSummary }
  | { type: "card_moved"; cardId: number; pileId: number; order: PileOrder[] }
  | { type: "card_deleted"; cardId: number }
  | { type: "card_updated"; cardId: number; title?: string; dueAt?: string | null }
  | { type: "card_labels"; cardId: number; labelIds: number[] }
  | { type: "card_assignees"; cardId: number; assignees: BoardAssignee[] }
  | { type: "pile_created"; pile: BoardPileSummary }
  | { type: "pile_updated"; pileId: number; title: string }
  | { type: "pile_deleted"; pileId: number };

type Handler = (event: BoardEvent) => void;

/**
 * Hold the registry on globalThis so the publisher and the subscriber
 * don't end up on different module instances under Next.js dev HMR (or
 * anywhere a route handler is re-evaluated).
 */
const globalForBus = globalThis as unknown as {
  __boardChannels?: Map<number, Set<Handler>>;
};
const channels: Map<number, Set<Handler>> =
  globalForBus.__boardChannels ?? new Map<number, Set<Handler>>();
if (!globalForBus.__boardChannels) {
  globalForBus.__boardChannels = channels;
}

export function subscribeBoard(boardId: number, handler: Handler): () => void {
  let set = channels.get(boardId);
  if (!set) {
    set = new Set();
    channels.set(boardId, set);
  }
  set.add(handler);
  return () => {
    const s = channels.get(boardId);
    if (!s) return;
    s.delete(handler);
    if (s.size === 0) channels.delete(boardId);
  };
}

export function publishBoard(boardId: number, event: BoardEvent): void {
  const set = channels.get(boardId);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(event);
    } catch {
      // A failing subscriber must not break the others.
    }
  }
}
