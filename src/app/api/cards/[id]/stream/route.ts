import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { requireCardCap } from "@/lib/workspace-access";
import { subscribeCard, type CardEvent } from "@/lib/card-bus";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cardId = Number(id);
  const guard = await requireCardCap(cardId, auth.session.sub, "view_board");
  if (!guard.ok) return guard.response;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          cleanup();
        }
      };
      send({ type: "connected", cardId });
      unsubscribe = subscribeCard(cardId, (event: CardEvent) => send(event));

      // Keep the connection alive past intermediate proxies.
      pingTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 25_000);

      const cleanup = () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (pingTimer) clearInterval(pingTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
