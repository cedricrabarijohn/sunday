import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, workspaceInvites } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import {
  WORKSPACE_ADMIN_ROLE_ID,
  WORKSPACE_MEMBER_ROLE_ID,
  requireWorkspaceCap,
} from "@/lib/workspace-access";

const ALLOWED_ROLE_IDS = new Set([WORKSPACE_ADMIN_ROLE_ID, WORKSPACE_MEMBER_ROLE_ID]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "manage_members");
  if (!guard.ok) return guard.response;

  const rows = await db
    .select({
      id: workspaceInvites.id,
      email: workspaceInvites.email,
      workspaceRoleId: workspaceInvites.workspaceRoleId,
      token: workspaceInvites.token,
      status: workspaceInvites.status,
      createdAt: workspaceInvites.createdAt,
      expiresAt: workspaceInvites.expiresAt,
      invitedByUserId: workspaceInvites.invitedByUserId,
      invitedByEmail: users.email,
      invitedByFirstname: users.firstname,
      invitedByLastname: users.lastname,
    })
    .from(workspaceInvites)
    .leftJoin(users, eq(users.id, workspaceInvites.invitedByUserId))
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        eq(workspaceInvites.status, "pending"),
      ),
    )
    .orderBy(asc(workspaceInvites.createdAt));

  return NextResponse.json({ invites: rows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const workspaceId = Number(id);
  const guard = await requireWorkspaceCap(workspaceId, auth.session.sub, "manage_members");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const emailRaw = typeof body?.email === "string" ? body.email.trim() : "";
  const email = emailRaw ? emailRaw : null;
  if (email && email.length > 254) {
    return NextResponse.json({ error: "Email too long" }, { status: 400 });
  }
  if (email && !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  const roleId = Number(body?.workspaceRoleId ?? WORKSPACE_MEMBER_ROLE_ID);
  if (!ALLOWED_ROLE_IDS.has(roleId)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [result] = await db.insert(workspaceInvites).values({
    workspaceId,
    email,
    workspaceRoleId: roleId,
    token,
    invitedByUserId: auth.session.sub,
    status: "pending",
    createdAt: now,
    expiresAt: expires,
  });
  const inviteId = Number((result as { insertId: number }).insertId);

  return NextResponse.json(
    {
      invite: {
        id: inviteId,
        token,
        email,
        workspaceRoleId: roleId,
        expiresAt: expires.toISOString(),
      },
    },
    { status: 201 },
  );
}
