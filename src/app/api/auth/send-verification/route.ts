import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";
import { createAuthToken } from "@/lib/auth-tokens";
import { appUrl, sendMail } from "@/lib/mail";
import { verifyEmail } from "@/lib/mail-templates";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/** Re-send the email-confirmation link to the signed-in user. */
export async function POST() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const [user] = await db
    .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, auth.session.sub))
    .limit(1);
  if (!user?.email) {
    return NextResponse.json({ error: "No email on file" }, { status: 400 });
  }
  if (user.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const token = await createAuthToken(auth.session.sub, "email_verify", VERIFY_TTL_MS);
  const { subject, html } = verifyEmail({
    verifyUrl: `${appUrl()}/users/verify_email?token=${token}`,
  });
  await sendMail({ to: user.email, subject, html });
  return NextResponse.json({ ok: true });
}
