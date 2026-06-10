import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createAuthToken } from "@/lib/auth-tokens";
import { appUrl, sendMail } from "@/lib/mail";
import { passwordResetEmail } from "@/lib/mail-templates";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(request: NextRequest) {
  const limited = rateLimit(`forgot:${clientIp(request)}`, 5, 15 * 60_000);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  // Always answer the same way so the form can't be used to probe which
  // addresses have accounts.
  const ok = NextResponse.json({ ok: true });
  if (!email) return ok;

  const [user] = await db
    .select({ id: users.id, email: users.email, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user || user.deletedAt || !user.email) return ok;

  const token = await createAuthToken(user.id, "password_reset", TTL_MS);
  const { subject, html } = passwordResetEmail({
    resetUrl: `${appUrl()}/users/reset_password?token=${token}`,
    minutes: 30,
  });
  await sendMail({ to: user.email, subject, html });
  return ok;
}
