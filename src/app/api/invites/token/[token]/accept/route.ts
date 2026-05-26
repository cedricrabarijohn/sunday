import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceInvites, workspaceUsers } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";

export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const [invite] = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, token))
    .limit(1);
  if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Invite is no longer valid" }, { status: 410 });
  }
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 410 });
  }

  // Already a member? Just mark accepted and return ok.
  const [existing] = await db
    .select({ userId: workspaceUsers.userId, role: workspaceUsers.workspaceRoleId, deletedAt: workspaceUsers.deletedAt })
    .from(workspaceUsers)
    .where(
      and(
        eq(workspaceUsers.workspaceId, invite.workspaceId),
        eq(workspaceUsers.userId, auth.session.sub),
      ),
    )
    .limit(1);

  const now = new Date();
  if (existing) {
    // Reactivate if previously soft-deleted, otherwise leave as-is.
    if (existing.deletedAt) {
      await db
        .update(workspaceUsers)
        .set({ deletedAt: null, workspaceRoleId: invite.workspaceRoleId })
        .where(
          and(
            eq(workspaceUsers.workspaceId, invite.workspaceId),
            eq(workspaceUsers.userId, auth.session.sub),
          ),
        );
    }
  } else {
    await db.insert(workspaceUsers).values({
      workspaceId: invite.workspaceId,
      userId: auth.session.sub,
      workspaceRoleId: invite.workspaceRoleId,
    });
  }

  await db
    .update(workspaceInvites)
    .set({ status: "accepted", acceptedAt: now, acceptedByUserId: auth.session.sub })
    .where(eq(workspaceInvites.id, invite.id));

  // Mark any other pending invites with the same email as accepted too,
  // so they don't pile up after the user converts one of them.
  if (invite.email) {
    await db
      .update(workspaceInvites)
      .set({ status: "accepted", acceptedAt: now, acceptedByUserId: auth.session.sub })
      .where(
        and(
          eq(workspaceInvites.workspaceId, invite.workspaceId),
          eq(workspaceInvites.email, invite.email),
          eq(workspaceInvites.status, "pending"),
        ),
      );
  }

  return NextResponse.json({
    ok: true,
    workspaceId: invite.workspaceId,
  });
}
