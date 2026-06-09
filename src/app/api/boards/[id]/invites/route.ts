import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { boardInvites, users } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { requireBoardCap } from "@/lib/workspace-access";
import { BOARD_ADMIN_ROLE_ID, BOARD_MEMBER_ROLE_ID } from "@/lib/board-access";
import { appUrl, sendMail } from "@/lib/mail";
import { inviteEmail } from "@/lib/mail-templates";

const ALLOWED_ROLE_IDS = new Set([BOARD_ADMIN_ROLE_ID, BOARD_MEMBER_ROLE_ID]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "manage_board_members");
  if (!guard.ok) return guard.response;

  const rows = await db
    .select({
      id: boardInvites.id,
      email: boardInvites.email,
      boardRoleId: boardInvites.boardRoleId,
      token: boardInvites.token,
      status: boardInvites.status,
      createdAt: boardInvites.createdAt,
      expiresAt: boardInvites.expiresAt,
      invitedByUserId: boardInvites.invitedByUserId,
      invitedByEmail: users.email,
      invitedByFirstname: users.firstname,
      invitedByLastname: users.lastname,
    })
    .from(boardInvites)
    .leftJoin(users, eq(users.id, boardInvites.invitedByUserId))
    .where(and(eq(boardInvites.boardId, boardId), eq(boardInvites.status, "pending")))
    .orderBy(asc(boardInvites.createdAt));

  return NextResponse.json({ invites: rows });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const boardId = Number(id);
  const guard = await requireBoardCap(boardId, auth.session.sub, "manage_board_members");
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
  const roleId = Number(body?.boardRoleId ?? BOARD_MEMBER_ROLE_ID);
  if (!ALLOWED_ROLE_IDS.has(roleId)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [result] = await db.insert(boardInvites).values({
    boardId,
    email,
    boardRoleId: roleId,
    token,
    invitedByUserId: auth.session.sub,
    status: "pending",
    createdAt: now,
    expiresAt: expires,
  });
  const inviteId = Number((result as { insertId: number }).insertId);

  if (email) {
    const [inviter] = await db
      .select({ firstname: users.firstname, lastname: users.lastname, email: users.email })
      .from(users)
      .where(eq(users.id, auth.session.sub))
      .limit(1);
    const inviterName =
      [inviter?.firstname, inviter?.lastname].filter(Boolean).join(" ") ||
      inviter?.email ||
      "Someone";
    const { subject, html } = inviteEmail({
      inviterName,
      resourceKind: "board",
      resourceName: guard.board.title || "a board",
      acceptUrl: `${appUrl()}/board-invites/${token}`,
    });
    await sendMail({ to: email, subject, html });
  }

  return NextResponse.json(
    {
      invite: {
        id: inviteId,
        token,
        email,
        boardRoleId: roleId,
        expiresAt: expires.toISOString(),
      },
    },
    { status: 201 },
  );
}
