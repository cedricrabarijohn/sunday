import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createSessionToken, hashPassword, setSessionCookie } from "@/lib/auth";
import { createAuthToken } from "@/lib/auth-tokens";
import { appUrl, sendMail } from "@/lib/mail";
import { verifyEmail } from "@/lib/mail-templates";

const USER_ROLE_ID = 2;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const { email, password, firstname, lastname } = body as {
      email?: string;
      password?: string;
      firstname?: string;
      lastname?: string;
    };

    if (!email || !password || !firstname || !lastname) {
      return NextResponse.json(
        { error: "firstname, lastname, email and password are required" },
        { status: 400 },
      );
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const hashed = await hashPassword(password);
    const [result] = await db.insert(users).values({
      email,
      firstname,
      lastname,
      hashedPassword: hashed,
      roleId: USER_ROLE_ID,
    });
    const userId = Number((result as { insertId: number }).insertId);

    const token = await createSessionToken({ sub: userId, email });
    await setSessionCookie(token);

    // Send a confirmation email (best-effort — never blocks signup).
    try {
      const verifyToken = await createAuthToken(userId, "email_verify", VERIFY_TTL_MS);
      const { subject, html } = verifyEmail({
        verifyUrl: `${appUrl()}/users/verify_email?token=${verifyToken}`,
      });
      await sendMail({ to: email, subject, html });
    } catch (err) {
      console.error("[mail] verification email failed:", err);
    }

    return NextResponse.json(
      { user: { id: userId, email, firstname, lastname } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
