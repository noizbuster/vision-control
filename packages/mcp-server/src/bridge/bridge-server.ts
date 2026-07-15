/**
 * Single-process loopback bridge: `GET /discover` + WebSocket `/bridge` (ADR-020 C2/C3).
 *
 * Binds 127.0.0.1:4322 by default. Fixed port — EADDRINUSE fails clearly.
 * Discover is secret-free. Pair token is validated on WS upgrade only.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

import {
  BRIDGE_WS_PATH,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  DISCOVER_PATH,
} from "./constants.js";
import { buildDiscoverResponse } from "./discover.js";
import { NonLoopbackHostError, validateLoopbackHost } from "./loopback.js";
import {
  type PairTokenState,
  validatePairToken,
} from "./pair-token.js";

export class BridgePortInUseError extends Error {
  constructor(public readonly port: number, public readonly host: string) {
    super(
      `Port ${port} is already in use on ${host}. ` +
        `Vision Control MCP uses fixed port ${DEFAULT_BRIDGE_PORT} (no multi-port scan). ` +
        `Stop the other process and retry.`,
    );
    this.name = "BridgePortInUseError";
  }
}

export interface BridgeServerOptions {
  /** Bind host. Must be loopback. Default `127.0.0.1`. */
  readonly host?: string;
  /** Bind port. Default `4322`. Use `0` only in tests. */
  readonly port?: number;
  /** Minted extension pair token (never returned from /discover). */
  readonly pairToken: PairTokenState;
  /** Injectable clock for token expiry checks. */
  readonly now?: () => number;
  /** Called when a pair token is accepted and the socket is open. */
  readonly onPaired?: (socket: WebSocket) => void;
}

export interface BridgeServerHandle {
  readonly httpServer: Server;
  readonly host: string;
  readonly port: number;
  readonly stop: () => Promise<void>;
}

/**
 * Start discover HTTP + bridge WebSocket on one loopback port.
 * Throws {@link NonLoopbackHostError} or {@link BridgePortInUseError}.
 */
export async function startBridgeServer(
  options: BridgeServerOptions,
): Promise<BridgeServerHandle> {
  const host = options.host ?? DEFAULT_BRIDGE_HOST;
  validateLoopbackHost(host);
  const requestedPort = options.port ?? DEFAULT_BRIDGE_PORT;
  const now = options.now ?? Date.now;

  const httpServer: Server = createServer((req, res) => {
    handleHttpRequest(req, res, host, () => actualPort);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    handleUpgrade(req, socket, head, wss, options.pairToken, now, options.onPaired);
  });

  let actualPort = requestedPort;
  await listenOrThrow(httpServer, requestedPort, host);
  const address = httpServer.address();
  if (address !== null && typeof address === "object") {
    actualPort = address.port;
  }

  return {
    httpServer,
    host,
    port: actualPort,
    stop: async () => {
      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}

function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  host: string,
  getPort: () => number,
): void {
  const url = new URL(req.url ?? "/", `http://${host}`);
  if (req.method === "GET" && url.pathname === DISCOVER_PATH) {
    const body = buildDiscoverResponse({ host, port: getPort() });
    const json = JSON.stringify(body);
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(json);
    return;
  }
  res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "NOT_FOUND" }));
}

function handleUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
  pairToken: PairTokenState,
  now: () => number,
  onPaired: ((socket: WebSocket) => void) | undefined,
): void {
  const hostHeader = req.headers.host ?? DEFAULT_BRIDGE_HOST;
  const url = new URL(req.url ?? "/", `http://${hostHeader}`);
  if (url.pathname !== BRIDGE_WS_PATH) {
    rejectUpgrade(socket, 404, "Not Found");
    return;
  }

  const candidate = extractPairToken(req, url);
  const validation = validatePairToken(pairToken, candidate, now());
  if (!validation.ok) {
    rejectUpgrade(socket, 401, `Unauthorized: ${validation.reason}`);
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    wss.emit("connection", ws, req);
    onPaired?.(ws);
  });
}

function extractPairToken(req: IncomingMessage, url: URL): string | undefined {
  const fromQuery = url.searchParams.get("token");
  if (fromQuery !== null && fromQuery.length > 0) return fromQuery;

  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const parts = auth.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer" && parts[1] !== undefined && parts[1].length > 0) {
      return parts[1];
    }
  }

  const headerToken = req.headers["x-vc-pair-token"];
  if (typeof headerToken === "string" && headerToken.length > 0) return headerToken;
  return undefined;
}

function rejectUpgrade(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function listenOrThrow(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      if (err.code === "EADDRINUSE") {
        reject(new BridgePortInUseError(port, host));
        return;
      }
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

export { NonLoopbackHostError };
