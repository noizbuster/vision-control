/**
 * Minimal JSON-RPC client for calling MCP tools over the HTTP transport.
 *
 * The CLI does NOT depend on the MCP SDK client library — it sends raw
 * JSON-RPC `tools/call` requests via `fetch` (Node 22+ global). This keeps
 * the CLI lightweight and avoids pulling the full SDK into the CLI bundle.
 */

export interface McpEndpoint {
  readonly url: string;
  readonly token?: string;
}

export type McpToolResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: string };

/** Call an MCP tool by name over the Streamable HTTP transport. */
export async function callMcpTool(
  endpoint: McpEndpoint,
  toolName: string,
  args?: Record<string, unknown>,
): Promise<McpToolResult> {
  let response: Response;
  try {
    response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(endpoint.token !== undefined ? { authorization: `Bearer ${endpoint.token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args ?? {} },
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `connection failed: ${message}` };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: `authentication rejected (HTTP ${response.status})` };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `HTTP ${response.status}: ${await response.text().catch(() => "unknown")}`,
    };
  }

  // The MCP Streamable HTTP transport responds with `text/event-stream`: the
  // JSON-RPC payload is on a `data:` line (`event: message\ndata: {...}`).
  // Plain `application/json` is also accepted (older transports / mocks), so
  // fall back to parsing the whole body as JSON. `response.json()` would throw
  // on the SSE body, breaking every data command against a real daemon.
  const raw = await response.text();
  const body = parseJsonRpc(raw);
  if (body === undefined) {
    return { ok: false, error: "malformed MCP response (no JSON-RPC payload)" };
  }
  if (body.error !== undefined) {
    return { ok: false, error: body.error.message };
  }
  const text = extractText(body.result);
  return { ok: true, text };
}

/**
 * Parse an MCP JSON-RPC response body. Handles both `text/event-stream` (the
 * payload on a `data:` line) and plain `application/json`. Returns `undefined`
 * when no payload can be extracted.
 */
function parseJsonRpc(body: string): McpJsonRpcResponse | undefined {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data: ")) {
      try {
        return JSON.parse(trimmed.slice("data: ".length)) as McpJsonRpcResponse;
      } catch {
        continue;
      }
    }
  }
  try {
    return JSON.parse(body) as McpJsonRpcResponse;
  } catch {
    return undefined;
  }
}

interface McpJsonRpcResponse {
  readonly jsonrpc?: string;
  readonly id?: number;
  readonly result?: {
    readonly content?: readonly { readonly type: string; readonly text?: string }[];
  };
  readonly error?: { readonly code: number; readonly message: string };
}

const extractText = (result: McpJsonRpcResponse["result"]): string => {
  const content = result?.content;
  if (content === undefined || content.length === 0) return "";
  const first = content[0];
  return first?.text ?? "";
};
