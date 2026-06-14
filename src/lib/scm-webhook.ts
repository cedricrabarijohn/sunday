import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTasks, boards, cardLinks, scmConnections } from "@/db/schema";
import { parseCardRefs, verifyGiteaSignature, verifyGithubSignature } from "@/lib/scm";
import { moveCardToPileByName } from "@/lib/card-move";
import { publishCardCounts } from "@/lib/card-counts";

export type ScmProvider = "gitea" | "github";

type LinkDraft = {
  cardId: number;
  kind: "commit" | "pr" | "branch";
  ref: string;
  title: string | null;
  url: string | null;
  state: string | null;
};

function verifySignature(
  provider: ScmProvider,
  raw: string,
  signature: string | null,
  secret: string | null,
): boolean {
  return provider === "github"
    ? verifyGithubSignature(raw, signature, secret)
    : verifyGiteaSignature(raw, signature, secret);
}

/**
 * Shared receiver for Gitea / GitHub webhooks. Both speak the same `push`
 * and `pull_request` shapes; only the signature scheme and the event/signature
 * header names differ (handled by each provider's thin route). Links commits
 * and PRs that reference `#cardId` to cards in the connection's own workspace,
 * refreshes live badge counts, and moves a card on PR merge when configured.
 */
export async function processScmWebhook({
  provider,
  token,
  raw,
  event,
  signature,
}: {
  provider: ScmProvider;
  token: string;
  raw: string;
  event: string | null;
  signature: string | null;
}): Promise<NextResponse> {
  const [conn] = await db
    .select()
    .from(scmConnections)
    .where(and(eq(scmConnections.webhookToken, token), eq(scmConnections.provider, provider)))
    .limit(1);
  // Don't reveal whether a token exists.
  if (!conn || conn.enabled !== 1) return NextResponse.json({ ok: false }, { status: 404 });

  if (!verifySignature(provider, raw, signature, conn.secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const drafts: LinkDraft[] = [];

  if (event === "push" && Array.isArray(payload.commits)) {
    for (const c of payload.commits as Array<Record<string, unknown>>) {
      const message = typeof c.message === "string" ? c.message : "";
      for (const cardId of parseCardRefs(message)) {
        drafts.push({
          cardId,
          kind: "commit",
          ref: String(c.id ?? "").slice(0, 255),
          title: message.split("\n")[0].slice(0, 255),
          url: typeof c.url === "string" ? c.url : null,
          state: null,
        });
      }
    }
  } else if (event === "pull_request" && payload.pull_request) {
    const pr = payload.pull_request as Record<string, unknown>;
    const state = pr.merged === true ? "merged" : typeof pr.state === "string" ? pr.state : null;
    for (const cardId of parseCardRefs(pr.title as string, pr.body as string)) {
      drafts.push({
        cardId,
        kind: "pr",
        ref: String(pr.number ?? ""),
        title: typeof pr.title === "string" ? pr.title.slice(0, 255) : null,
        url: typeof pr.html_url === "string" ? pr.html_url : null,
        state,
      });
    }
  }

  if (drafts.length === 0) return NextResponse.json({ ok: true, linked: 0 });

  // Only link cards that actually belong to this connection's workspace.
  const candidateIds = [...new Set(drafts.map((d) => d.cardId))];
  const validRows = await db
    .select({ id: boardTasks.id, boardId: boardTasks.boardId, pileId: boardTasks.pileId })
    .from(boardTasks)
    .innerJoin(boards, eq(boards.id, boardTasks.boardId))
    .where(
      and(
        inArray(boardTasks.id, candidateIds),
        eq(boards.workspaceId, conn.workspaceId),
        isNull(boardTasks.deletedAt),
      ),
    );
  const validById = new Map(validRows.map((r) => [r.id, r]));

  const now = new Date();
  let linked = 0;
  const touchedCards = new Set<number>();
  for (const d of drafts) {
    if (!validById.has(d.cardId) || !d.ref) continue;
    await db
      .insert(cardLinks)
      .values({ ...d, createdAt: now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { title: d.title, url: d.url, state: d.state, updatedAt: now } });
    linked += 1;
    touchedCards.add(d.cardId);
  }

  // Refresh the live "linked code" badge on every open board view.
  for (const cardId of touchedCards) {
    const card = validById.get(cardId);
    if (card?.boardId != null) await publishCardCounts(card.boardId, cardId);
  }

  // Auto-advance: a merged PR moves each linked card to the configured pile
  // in its own board. Best-effort — never let a move failure fail the hook.
  let moved = 0;
  const isMergedPr =
    event === "pull_request" &&
    (payload.pull_request as Record<string, unknown> | undefined)?.merged === true;
  if (isMergedPr && conn.donePileName) {
    const movedCardIds = new Set<number>();
    for (const d of drafts) {
      const card = validById.get(d.cardId);
      if (!card || card.boardId == null || movedCardIds.has(card.id)) continue;
      movedCardIds.add(card.id);
      try {
        if (
          await moveCardToPileByName(
            { id: card.id, boardId: card.boardId, pileId: card.pileId },
            conn.donePileName,
          )
        ) {
          moved += 1;
        }
      } catch {
        // Linking already succeeded; a failed move must not 500 the webhook.
      }
    }
  }

  return NextResponse.json({ ok: true, linked, moved });
}
