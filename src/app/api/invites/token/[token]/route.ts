import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, workspaceInvites, workspaces } from "@/db/schema";

/**
 * Public lookup by token: used by the accept page to render context
 * before asking the user to sign in. We only return enough metadata to
 * show a sensible preview.
 */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const [row] = await db
    .select({
      id: workspaceInvites.id,
      workspaceId: workspaceInvites.workspaceId,
      workspaceTitle: workspaces.title,
      email: workspaceInvites.email,
      workspaceRoleId: workspaceInvites.workspaceRoleId,
      status: workspaceInvites.status,
      createdAt: workspaceInvites.createdAt,
      expiresAt: workspaceInvites.expiresAt,
      invitedByEmail: users.email,
      invitedByFirstname: users.firstname,
      invitedByLastname: users.lastname,
    })
    .from(workspaceInvites)
    .leftJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
    .leftJoin(users, eq(users.id, workspaceInvites.invitedByUserId))
    .where(eq(workspaceInvites.token, token))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const expired = row.expiresAt ? row.expiresAt.getTime() < Date.now() : false;
  return NextResponse.json({
    invite: { ...row, expired },
  });
}
