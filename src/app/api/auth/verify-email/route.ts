import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { consumeAuthToken } from "@/lib/auth-tokens";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const userId = await consumeAuthToken(token, "email_verify");
  if (userId === null) {
    return NextResponse.json(
      { error: "This confirmation link is invalid or has expired." },
      { status: 400 },
    );
  }

  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
