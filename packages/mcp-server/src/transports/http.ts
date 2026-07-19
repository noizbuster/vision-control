/**
 * Loopback HTTP transport for the MCP server (Streamable HTTP).
 *
 * Serves the MCP server over HTTP using `StreamableHTTPServerTransport` from
 * `@modelcontextprotocol/sdk`. Binds to `127.0.0.1` ONLY — never to
 * `0.0.0.0` or a public interface (PRD section 27.1). Every request passes
 * through {@link checkAuth} before reaching the MCP transport; unauthenticated
 * requests are rejected with no context leakage.
 *
 * STATELESS PATTERN: the MCP SDK's `StreamableHTTPServerTransport` does not
 * support sequential requests on a single connected instance. Each HTTP
 * request gets a fresh transport + a `connect()` / `close()` cycle on the
 * shared `McpServer`. Tool handlers registered via `registerTool` persist
 * across cycles (they live on the server, not the transport), so this is
 * safe and cheap.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { type AuthConfig, checkAuth } from "../auth.js";
import { DEFAULT_BRIDGE_HOST } from "../bridge/constants.js";
import { validateLoopbackHost } from "../bridge/loopback.js";

export interface HttpTransportOptions {
  /** Bind port. 0 = ephemeral. */
  readonly port: number;
  /** Bind host. Must be loopback. Default `127.0.0.1`. */
  readonly host?: string;
  /** Auth config: token + origin allowlist. */
  readonly auth: AuthConfig;
}

export interface HttpTransportHandle {
  readonly server: Server;
  readonly port: number;
  readonly host: string;
  readonly stop: () => Promise<void>;
}

/**
 * Start serving `mcpServer` over loopback HTTP.
 *
 * Throws if `host` is not a loopback address. The returned handle's `stop()`
 * closes the HTTP server.
 */
export async function startHttpTransport(
  mcpServer: McpServer,
  opts: HttpTransportOptions,
): Promise<HttpTransportHandle> {
  const host = opts.host ?? DEFAULT_BRIDGE_HOST;
  validateLoopbackHost(host);

  const httpServer: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handleRequest(req, res, mcpServer, opts.auth);
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(opts.port, host, () => resolve());
  });

  const address = httpServer.address();
  const actualPort = address !== null && typeof address === "object" ? address.port : opts.port;

  return {
    server: httpServer,
    port: actualPort,
    host,
    stop: async () => {
      httpServer.close();
    },
  };
}

/**
 * Handle a single HTTP request: auth-check, then delegate to the MCP transport.
 * Unauthenticated requests are rejected before the transport sees them.
 *
 * Each request creates a fresh `StreamableHTTPServerTransport` and reconnects
 * the shared `McpServer`. This is the SDK's documented stateless pattern: a
 * single connected transport cannot process sequential requests.
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  mcpServer: McpServer,
  auth: AuthConfig,
): Promise<void> {
  const authResult = checkAuth(req, auth);
  if (!authResult.ok) {
    res.writeHead(authResult.status, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: authResult.code, message: authResult.reason }));
    return;
  }

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);
  try {
    const body = await readJsonBody(req);
    await transport.handleRequest(req, res, body);
  } finally {
    await mcpServer.close();
  }
}

/** Read and parse the JSON body from a Node HTTP request. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (raw.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", () => resolve(undefined));
  });
}
