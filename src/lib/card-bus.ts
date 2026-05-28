/**
 * Module-singleton pub/sub for per-card events. Lets the SSE endpoint
 * push comment updates to every subscribed drawer without a database
 * round-trip. Single Node process only — if/when we scale out, swap
 * the channel map for Redis pub/sub or NATS.
 */

export type CardComment = {
  id: number;
  body: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  userId: number;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
};

export type CardEvent =
  | { type: "comment_created"; comment: CardComment }
  | {
      type: "comment_updated";
      commentId: number;
      body: string;
      updatedAt: string;
    }
  | { type: "comment_deleted"; commentId: number };

type Handler = (event: CardEvent) => void;

const channels = new Map<number, Set<Handler>>();

export function subscribeCard(cardId: number, handler: Handler): () => void {
  let set = channels.get(cardId);
  if (!set) {
    set = new Set();
    channels.set(cardId, set);
  }
  set.add(handler);
  return () => {
    const s = channels.get(cardId);
    if (!s) return;
    s.delete(handler);
    if (s.size === 0) channels.delete(cardId);
  };
}

export function publishCard(cardId: number, event: CardEvent): void {
  const set = channels.get(cardId);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(event);
    } catch {
      // A failing subscriber must not break the others.
    }
  }
}
