import type { NextRequest } from "next/server";
import { verifyApiToken } from "@/lib/api-tokens";
import { TOOLS, runTool, ToolError } from "@/lib/mcp/tools";

/**
 * Model Context Protocol endpoint for Sunday.
 *
 * Speaks MCP over the "Streamable HTTP" transport in its simplest, stateless
 * form: each POST carries one (or a batch of) JSON-RPC 2.0 message(s) and gets
 * a single application/json response. No session handshake, no SSE stream —
 * which is all a tools-only server needs and keeps it trivial to host inside a
 * Next route handler. Auth is a Bearer personal access token.
 *
 * Connect a remote MCP client to `<APP_URL>/api/mcp` with header
 *   Authorization: Bearer sun_pat_…
 * or bridge it to a local stdio client with `npx mcp-remote <url> --header ...`.
 */
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "sunday", version: "1.0.0" };

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

function result(id: JsonRpcId, value: unknown) {
  return { jsonrpc: "2.0" as const, id, result: value };
}
function error(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="sunday-mcp"',
    },
  });
}

async function handleMessage(
  msg: JsonRpcRequest,
  userId: number,
): Promise<object | null> {
  const id = msg.id ?? null;

  // Notifications (no id) get acknowledged with no response body.
  if (msg.id === undefined) return null;

  switch (msg.method) {
    case "initialize":
      return result(id, {
        protocolVersion:
          typeof msg.params?.protocolVersion === "string"
            ? msg.params.protocolVersion
            : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const value = await runTool(name, userId, args);
        return result(id, {
          content: [{ type: "text", text: JSON.stringify(value) }],
        });
      } catch (e) {
        // Tool-level failures (validation, permissions) are reported in-band as
        // an errored result so the model can read and react to them, rather
        // than as a transport-level JSON-RPC error.
        const message = e instanceof ToolError ? e.message : "Internal tool error";
        if (!(e instanceof ToolError)) console.error("[mcp] tool error:", e);
        return result(id, { content: [{ type: "text", text: message }], isError: true });
      }
    }

    default:
      return error(id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: NextRequest) {
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const userId = token ? await verifyApiToken(token) : null;
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(error(null, -32700, "Parse error"), { status: 400 });
  }

  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as JsonRpcRequest[];
  const responses: object[] = [];
  for (const msg of messages) {
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      responses.push(error(msg?.id ?? null, -32600, "Invalid Request"));
      continue;
    }
    const res = await handleMessage(msg, userId);
    if (res) responses.push(res);
  }

  // All notifications → nothing to return.
  if (responses.length === 0) return new Response(null, { status: 202 });
  return Response.json(batch ? responses : responses[0]);
}

// The stateless server has no server-initiated stream and no session to end.
export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
