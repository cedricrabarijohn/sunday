import { NextRequest } from "next/server";
import { processScmWebhook } from "@/lib/scm-webhook";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return processScmWebhook({
    provider: "forgejo",
    token,
    raw: await request.text(),
    headers: request.headers,
  });
}
