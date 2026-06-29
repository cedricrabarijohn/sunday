import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { users, workspaceInvites, workspaceUsers, workspaces } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { appUrl, sendMail } from "@/lib/mail";
import { inviteEmail } from "@/lib/mail-templates";
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

  const now = new Date();

  // Reject an email that already belongs to a member of this workspace, or that
  // already has a pending, unexpired invite. (Link-only invites have no email.)
  if (email) {
    const [existingMember] = await db
      .select({ userId: workspaceUsers.userId })
      .from(workspaceUsers)
      .innerJoin(users, eq(users.id, workspaceUsers.userId))
      .where(
        and(
          eq(workspaceUsers.workspaceId, workspaceId),
          isNull(workspaceUsers.deletedAt),
          eq(users.email, email),
        ),
      )
      .limit(1);
    if (existingMember) {
      return NextResponse.json(
        { error: "That email already belongs to a member of this workspace" },
        { status: 409 },
      );
    }

    const [pendingInvite] = await db
      .select({ id: workspaceInvites.id })
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.workspaceId, workspaceId),
          eq(workspaceInvites.email, email),
          eq(workspaceInvites.status, "pending"),
          gt(workspaceInvites.expiresAt, now),
        ),
      )
      .limit(1);
    if (pendingInvite) {
      return NextResponse.json(
        { error: "That email already has a pending invite to this workspace" },
        { status: 409 },
      );
    }
  }

  const token = crypto.randomBytes(24).toString("base64url");
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

  // Email the invite link (best-effort; only when an address was given).
  if (email) {
    const [inviter] = await db
      .select({ firstname: users.firstname, lastname: users.lastname, email: users.email })
      .from(users)
      .where(eq(users.id, auth.session.sub))
      .limit(1);
    const [ws] = await db
      .select({ title: workspaces.title })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const inviterName =
      [inviter?.firstname, inviter?.lastname].filter(Boolean).join(" ") ||
      inviter?.email ||
      "Someone";
    const { subject, html } = inviteEmail({
      inviterName,
      resourceKind: "workspace",
      resourceName: ws?.title || "a workspace",
      acceptUrl: `${appUrl()}/invites/${token}`,
    });
    await sendMail({ to: email, subject, html });
  }

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
