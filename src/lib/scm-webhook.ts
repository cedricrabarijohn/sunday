import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTasks, boards, cardLinks, scmConnections } from "@/db/schema";
import {
  parseCardRefs,
  verifyGiteaSignature,
  verifyGithubSignature,
  verifyGitlabToken,
} from "@/lib/scm";
import { moveCardToPileByName } from "@/lib/card-move";
import { publishCardCounts } from "@/lib/card-counts";

export type ScmProvider = "gitea" | "github" | "gitlab" | "bitbucket";
export const SCM_PROVIDERS: ScmProvider[] = ["gitea", "github", "gitlab", "bitbucket"];
export const isScmProvider = (v: string): v is ScmProvider =>
  (SCM_PROVIDERS as string[]).includes(v);

type LinkDraft = {
  cardId: number;
  kind: "commit" | "pr" | "branch";
  ref: string;
  title: string | null;
  url: string | null;
  state: string | null;
};

type NormalizedCommit = { id: string; message: string; url: string | null };
type Normalized =
  | { kind: "push"; commits: NormalizedCommit[] }
  | {
      kind: "pr";
      ref: string;
      title: string | null;
      body: string | null;
      url: string | null;
      merged: boolean;
      state: string | null;
    }
  | { kind: "ignore" };

type Rec = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const get = (o: unknown, k: string): unknown => (o && typeof o === "object" ? (o as Rec)[k] : undefined);

/** push payload whose commits live at `commits[]` ({id|hash, message, url}). */
function pushFromCommits(commitsRaw: unknown): Normalized {
  const commits: NormalizedCommit[] = [];
  if (Array.isArray(commitsRaw)) {
    for (const c of commitsRaw) {
      commits.push({
        id: String(get(c, "id") ?? get(c, "hash") ?? ""),
        message: str(get(c, "message")) ?? "",
        url: str(get(c, "url")),
      });
    }
  }
  return { kind: "push", commits };
}

/** Gitea/GitHub pull_request object. */
function prFromPullRequest(prRaw: unknown): Normalized {
  const merged = get(prRaw, "merged") === true;
  const state = merged ? "merged" : str(get(prRaw, "state"));
  return {
    kind: "pr",
    ref: String(get(prRaw, "number") ?? ""),
    title: str(get(prRaw, "title")),
    body: str(get(prRaw, "body")),
    url: str(get(prRaw, "html_url")),
    merged,
    state,
  };
}

type Adapter = {
  verify(raw: string, headers: Headers, secret: string | null): boolean;
  parse(headers: Headers, payload: Rec): Normalized;
};

const ADAPTERS: Record<ScmProvider, Adapter> = {
  gitea: {
    verify: (raw, h, s) => verifyGiteaSignature(raw, h.get("x-gitea-signature"), s),
    parse: (h, p) => {
      const e = h.get("x-gitea-event");
      if (e === "push") return pushFromCommits(p.commits);
      if (e === "pull_request") return prFromPullRequest(p.pull_request);
      return { kind: "ignore" };
    },
  },
  github: {
    verify: (raw, h, s) => verifyGithubSignature(raw, h.get("x-hub-signature-256"), s),
    parse: (h, p) => {
      const e = h.get("x-github-event");
      if (e === "push") return pushFromCommits(p.commits);
      if (e === "pull_request") return prFromPullRequest(p.pull_request);
      return { kind: "ignore" };
    },
  },
  gitlab: {
    verify: (_raw, h, s) => verifyGitlabToken(h.get("x-gitlab-token"), s),
    parse: (h, p) => {
      const e = h.get("x-gitlab-event");
      if (e === "Push Hook") return pushFromCommits(p.commits);
      if (e === "Merge Request Hook") {
        const oa = p.object_attributes;
        const state = str(get(oa, "state")); // opened | merged | closed
        const merged = state === "merged" || get(oa, "action") === "merge";
        return {
          kind: "pr",
          ref: String(get(oa, "iid") ?? ""),
          title: str(get(oa, "title")),
          body: str(get(oa, "description")),
          url: str(get(oa, "url")),
          merged,
          state,
        };
      }
      return { kind: "ignore" };
    },
  },
  bitbucket: {
    // Bitbucket signs with the same HMAC-SHA256 scheme as GitHub, under X-Hub-Signature.
    verify: (raw, h, s) => verifyGithubSignature(raw, h.get("x-hub-signature"), s),
    parse: (h, p) => {
      const e = h.get("x-event-key");
      if (e === "repo:push") {
        const commits: NormalizedCommit[] = [];
        const changes = get(p.push, "changes");
        if (Array.isArray(changes)) {
          for (const ch of changes) {
            const cs = get(ch, "commits");
            if (Array.isArray(cs)) {
              for (const c of cs) {
                commits.push({
                  id: String(get(c, "hash") ?? ""),
                  message: str(get(c, "message")) ?? "",
                  url: str(get(get(get(c, "links"), "html"), "href")),
                });
              }
            }
          }
        }
        return { kind: "push", commits };
      }
      if (typeof e === "string" && e.startsWith("pullrequest:")) {
        const pr = p.pullrequest;
        const state = str(get(pr, "state"))?.toLowerCase() ?? null; // open | merged | declined
        const merged = e === "pullrequest:fulfilled" || state === "merged";
        return {
          kind: "pr",
          ref: String(get(pr, "id") ?? ""),
          title: str(get(pr, "title")),
          body: str(get(pr, "description")),
          url: str(get(get(get(pr, "links"), "html"), "href")),
          merged,
          state: merged ? "merged" : state,
        };
      }
      return { kind: "ignore" };
    },
  },
};

/**
 * Shared receiver for every SCM provider. Each provider's thin route hands us
 * the raw body + headers; the adapter verifies the request and normalizes the
 * payload into commits / a PR. From there the flow is identical: link commits
 * and PRs that reference `#cardId` to cards in the connection's own workspace,
 * refresh live badge counts, and move a card on PR merge when configured.
 */
export async function processScmWebhook({
  provider,
  token,
  raw,
  headers,
}: {
  provider: ScmProvider;
  token: string;
  raw: string;
  headers: Headers;
}): Promise<NextResponse> {
  const [conn] = await db
    .select()
    .from(scmConnections)
    .where(and(eq(scmConnections.webhookToken, token), eq(scmConnections.provider, provider)))
    .limit(1);
  // Don't reveal whether a token exists.
  if (!conn || conn.enabled !== 1) return NextResponse.json({ ok: false }, { status: 404 });

  const adapter = ADAPTERS[provider];
  if (!adapter.verify(raw, headers, conn.secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Rec;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const norm = adapter.parse(headers, payload);

  const drafts: LinkDraft[] = [];
  if (norm.kind === "push") {
    for (const c of norm.commits) {
      if (!c.id) continue;
      for (const cardId of parseCardRefs(c.message)) {
        drafts.push({
          cardId,
          kind: "commit",
          ref: c.id.slice(0, 255),
          title: c.message.split("\n")[0].slice(0, 255),
          url: c.url,
          state: null,
        });
      }
    }
  } else if (norm.kind === "pr") {
    for (const cardId of parseCardRefs(norm.title, norm.body)) {
      drafts.push({
        cardId,
        kind: "pr",
        ref: norm.ref,
        title: norm.title ? norm.title.slice(0, 255) : null,
        url: norm.url,
        state: norm.state,
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
  if (norm.kind === "pr" && norm.merged && conn.donePileName) {
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
