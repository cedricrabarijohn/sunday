import { NextResponse } from "next/server";
import { getSessionFromCookie, SessionPayload } from "./auth";

export type AuthOk = { ok: true; session: SessionPayload };
export type AuthFail = { ok: false; response: NextResponse };

export async function requireAuth(): Promise<AuthOk | AuthFail> {
  const session = await getSessionFromCookie();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, session };
}
