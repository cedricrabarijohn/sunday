import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/require-auth";

/** Update the signed-in user's profile (name + email). */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const firstname = typeof body?.firstname === "string" ? body.firstname.trim() : "";
  const lastname = typeof body?.lastname === "string" ? body.lastname.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!firstname || !lastname || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }
  if (firstname.length > 100 || lastname.length > 100 || email.length > 255) {
    return NextResponse.json({ error: "One of the fields is too long" }, { status: 400 });
  }
  if (!/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // Reject an email already used by someone else.
  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), ne(users.id, auth.session.sub)))
    .limit(1);
  if (clash) {
    return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
  }

  // A changed email is no longer verified.
  const [current] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, auth.session.sub))
    .limit(1);
  const emailChanged = current?.email !== email;

  await db
    .update(users)
    .set({ firstname, lastname, email, ...(emailChanged ? { emailVerifiedAt: null } : {}) })
    .where(eq(users.id, auth.session.sub));

  return NextResponse.json({ user: { firstname, lastname, email } });
}
