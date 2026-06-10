import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = rateLimit(`reset:${clientIp(request)}`, 10, 15 * 60_000);
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!token || !password) {
    return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const userId = await consumeAuthToken(token, "password_reset");
  if (userId === null) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const hashed = await hashPassword(password);
  await db.update(users).set({ hashedPassword: hashed }).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
