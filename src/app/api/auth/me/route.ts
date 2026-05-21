import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSessionFromCookie } from "@/lib/auth";

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) return NextResponse.json({ user: null }, { status: 200 });

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        firstname: users.firstname,
        lastname: users.lastname,
        roleId: users.roleId,
      })
      .from(users)
      .where(eq(users.id, session.sub))
      .limit(1);

    if (!user) return NextResponse.json({ user: null }, { status: 200 });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Get current user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
