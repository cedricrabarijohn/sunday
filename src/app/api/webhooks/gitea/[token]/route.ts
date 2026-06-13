import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boardTasks, boards, cardLinks, scmConnections } from "@/db/schema";
import { parseCardRefs, verifyGiteaSignature } from "@/lib/scm";

export const dynamic = "force-dynamic";

type LinkDraft = {
  cardId: number;
  kind: "commit" | "pr" | "branch";
  ref: string;
  title: string | null;
  url: string | null;
  state: string | null;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const raw = await request.text();
  const event = request.headers.get("x-gitea-event");
  const signature = request.headers.get("x-gitea-signature");

  const [conn] = await db
    .select()
    .from(scmConnections)
    .where(eq(scmConnections.webhookToken, token))
    .limit(1);
  // Don't reveal whether a token exists.
  if (!conn || conn.enabled !== 1) return NextResponse.json({ ok: false }, { status: 404 });

  if (!verifyGiteaSignature(raw, signature, conn.secret)) {
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
    .select({ id: boardTasks.id })
    .from(boardTasks)
    .innerJoin(boards, eq(boards.id, boardTasks.boardId))
    .where(
      and(
        inArray(boardTasks.id, candidateIds),
        eq(boards.workspaceId, conn.workspaceId),
        isNull(boardTasks.deletedAt),
      ),
    );
  const valid = new Set(validRows.map((r) => r.id));

  const now = new Date();
  let linked = 0;
  for (const d of drafts) {
    if (!valid.has(d.cardId) || !d.ref) continue;
    await db
      .insert(cardLinks)
      .values({ ...d, createdAt: now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { title: d.title, url: d.url, state: d.state, updatedAt: now } });
    linked += 1;
  }

  return NextResponse.json({ ok: true, linked });
}
