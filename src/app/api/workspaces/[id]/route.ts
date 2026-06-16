import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { boards, workspaces, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireWorkspaceCap } from "@/lib/workspace-access";

async function userInWorkspace(userId: number, workspaceId: number) {
  const [row] = await db
    .select({ role: workspaceUsers.workspaceRoleId })
    .from(workspaceUsers)
    .where(
      and(
        eq(workspaceUsers.userId, userId),
        eq(workspaceUsers.workspaceId, workspaceId),
        isNull(workspaceUsers.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  if (!Number.isFinite(workspaceId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const membership = await userInWorkspace(auth.session.sub, workspaceId);
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ workspace, role: membership.role });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  if (!Number.isFinite(workspaceId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "edit_workspace");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : null;
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (title.length > 80) {
    return NextResponse.json({ error: "title too long (max 80)" }, { status: 400 });
  }

  await db.update(workspaces).set({ title }).where(eq(workspaces.id, workspaceId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  if (!Number.isFinite(workspaceId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "delete_workspace");
  if (!guard.ok) return guard.response;

  const now = new Date();
  // Soft-delete all boards inside, then the workspace itself.
  await db
    .update(boards)
    .set({ deletedAt: now })
    .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.deletedAt)));
  await db.update(workspaces).set({ deletedAt: now }).where(eq(workspaces.id, workspaceId));

  return NextResponse.json({ ok: true });
}
