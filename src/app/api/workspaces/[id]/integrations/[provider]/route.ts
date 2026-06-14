import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { scmConnections } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireWorkspaceCap } from "@/lib/workspace-access";
import { appUrl } from "@/lib/mail";
import { randomToken } from "@/lib/scm";
import type { ScmProvider } from "@/lib/scm-webhook";

const PROVIDERS: ScmProvider[] = ["gitea", "github"];
const isProvider = (v: string): v is ScmProvider => (PROVIDERS as string[]).includes(v);

async function load(workspaceId: number, provider: ScmProvider) {
  const [row] = await db
    .select()
    .from(scmConnections)
    .where(and(eq(scmConnections.workspaceId, workspaceId), eq(scmConnections.provider, provider)))
    .limit(1);
  return row;
}

function present(provider: ScmProvider, row: NonNullable<Awaited<ReturnType<typeof load>>>) {
  return {
    connected: true,
    provider,
    baseUrl: row.baseUrl,
    enabled: row.enabled === 1,
    secret: row.secret,
    donePileName: row.donePileName ?? "",
    webhookUrl: `${appUrl()}/api/webhooks/${provider}/${row.webhookToken}`,
  };
}

async function resolve(params: Promise<{ id: string; provider: string }>) {
  const { id, provider } = await params;
  return { workspaceId: Number(id), provider };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string; provider: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { workspaceId, provider } = await resolve(params);
  if (!isProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "manage_members");
  if (!guard.ok) return guard.response;

  const row = await load(workspaceId, provider);
  return NextResponse.json(row ? present(provider, row) : { connected: false, provider });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; provider: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { workspaceId, provider } = await resolve(params);
  if (!isProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "manage_members");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl.trim().replace(/\/+$/, "") : "";
  if (baseUrl && !/^https?:\/\/.+/.test(baseUrl)) {
    return NextResponse.json({ error: "Base URL must start with http(s)://" }, { status: 400 });
  }
  const enabled = body?.enabled === false ? 0 : 1;
  const donePileName =
    typeof body?.donePileName === "string" ? body.donePileName.trim().slice(0, 60) || null : undefined;
  const now = new Date();

  const existing = await load(workspaceId, provider);
  if (existing) {
    const set: Record<string, unknown> = { baseUrl, enabled, updatedAt: now };
    if (donePileName !== undefined) set.donePileName = donePileName;
    if (body?.regenerateSecret === true) set.secret = randomToken(18);
    await db.update(scmConnections).set(set).where(eq(scmConnections.id, existing.id));
  } else {
    await db.insert(scmConnections).values({
      workspaceId,
      provider,
      baseUrl,
      webhookToken: randomToken(24),
      secret: randomToken(18),
      enabled,
      donePileName: donePileName ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const row = await load(workspaceId, provider);
  return NextResponse.json(present(provider, row!));
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; provider: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { workspaceId, provider } = await resolve(params);
  if (!isProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "manage_members");
  if (!guard.ok) return guard.response;

  await db
    .delete(scmConnections)
    .where(and(eq(scmConnections.workspaceId, workspaceId), eq(scmConnections.provider, provider)));
  return NextResponse.json({ ok: true });
}
