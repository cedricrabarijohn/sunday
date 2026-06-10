import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { requireAuth } from "@/lib/require-auth";

/** Change the signed-in user's password (current password required). */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Both passwords are required" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  const [user] = await db
    .select({ hashedPassword: users.hashedPassword })
    .from(users)
    .where(eq(users.id, auth.session.sub))
    .limit(1);
  if (!user?.hashedPassword) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const ok = await verifyPassword(currentPassword, user.hashedPassword);
  if (!ok) {
    return NextResponse.json({ error: "Your current password is incorrect" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ hashedPassword: await hashPassword(newPassword) })
    .where(eq(users.id, auth.session.sub));

  return NextResponse.json({ ok: true });
}
