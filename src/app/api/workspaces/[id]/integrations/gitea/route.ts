import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { scmConnections } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireWorkspaceCap } from "@/lib/workspace-access";
import { appUrl } from "@/lib/mail";
import { randomToken } from "@/lib/scm";

const PROVIDER = "gitea";

async function load(workspaceId: number) {
  const [row] = await db
    .select()
    .from(scmConnections)
    .where(and(eq(scmConnections.workspaceId, workspaceId), eq(scmConnections.provider, PROVIDER)))
    .limit(1);
  return row;
}

function present(row: NonNullable<Awaited<ReturnType<typeof load>>>) {
  return {
    connected: true,
    provider: PROVIDER,
    baseUrl: row.baseUrl,
    enabled: row.enabled === 1,
    secret: row.secret,
    donePileName: row.donePileName ?? "",
    webhookUrl: `${appUrl()}/api/webhooks/gitea/${row.webhookToken}`,
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const workspaceId = Number((await params).id);
  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "manage_members");
  if (!guard.ok) return guard.response;

  const row = await load(workspaceId);
  return NextResponse.json(row ? present(row) : { connected: false, provider: PROVIDER });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const workspaceId = Number((await params).id);
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

  const existing = await load(workspaceId);
  if (existing) {
    const set: Record<string, unknown> = { baseUrl, enabled, updatedAt: now };
    if (donePileName !== undefined) set.donePileName = donePileName;
    if (body?.regenerateSecret === true) set.secret = randomToken(18);
    await db.update(scmConnections).set(set).where(eq(scmConnections.id, existing.id));
  } else {
    await db.insert(scmConnections).values({
      workspaceId,
      provider: PROVIDER,
      baseUrl,
      webhookToken: randomToken(24),
      secret: randomToken(18),
      enabled,
      donePileName: donePileName ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const row = await load(workspaceId);
  return NextResponse.json(present(row!));
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const workspaceId = Number((await params).id);
  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "manage_members");
  if (!guard.ok) return guard.response;

  await db
    .delete(scmConnections)
    .where(and(eq(scmConnections.workspaceId, workspaceId), eq(scmConnections.provider, PROVIDER)));
  return NextResponse.json({ ok: true });
}
