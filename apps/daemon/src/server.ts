import { createServer, type IncomingMessage, type Server } from "node:http";
import type {
  ConnectionService,
  ProtocolHandler,
  SessionService,
  WorkspaceService,
} from "@vision-control/daemon-core";
import { authenticateUpgrade } from "@vision-control/daemon-core";
import type { Logger } from "@vision-control/logger";
import type { OriginAllowlistConfig } from "@vision-control/security";
import type { SessionRow } from "@vision-control/storage";
import { runMigrations } from "@vision-control/storage";
import type Database from "better-sqlite3";
import { type WebSocket, WebSocketServer } from "ws";

/** Hosts that count as loopback; the daemon refuses to bind anything else. */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export class NonLoopbackHostError extends Error {
  constructor(public readonly host: string) {
    super(
      `Refusing to bind to "${host}". The daemon is loopback-only for security (PRD §27.1). ` +
        `Use 127.0.0.1, ::1, or localhost. Binding 0.0.0.0 would expose the daemon to the network.`,
    );
    this.name = "NonLoopbackHostError";
  }
}

/** Validate that `host` is a loopback address. Throws {@link NonLoopbackHostError} otherwise. */
export function validateHost(host: string): void {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new NonLoopbackHostError(host);
  }
}

export interface DaemonServerOptions {
  readonly host: string;
  readonly port: number;
  readonly db: Database.Database;
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly sessionService: SessionService;
  readonly connectionService: ConnectionService;
  readonly workspaceService: WorkspaceService;
  readonly protocolHandler: ProtocolHandler;
  readonly originConfig: OriginAllowlistConfig;
  readonly logger: Logger;
  /** Called once with the pairing info after the server is listening. */
  readonly onReady?: (info: PairingInfo) => void;
}

export interface PairingInfo {
  readonly port: number;
  readonly host: string;
  readonly pairingUrl: string;
  readonly token: string;
  readonly sessionId: string;
}

export interface DaemonServer {
  readonly httpServer: Server;
  readonly pairingInfo: PairingInfo;
  readonly stop: () => Promise<void>;
}

/**
 * Build and start the authenticated loopback daemon server.
 *
 * Runs migrations, wires the WebSocket `upgrade` handler to the auth + origin
 * checks, and the `connection` handler to the protocol dispatcher. Returns a
 * handle whose `stop()` closes the WS server, active connections, and HTTP
 * server. Never binds a non-loopback host — {@link validateHost} throws first.
 */
export async function createDaemonServer(options: DaemonServerOptions): Promise<DaemonServer> {
  validateHost(options.host);
  runMigrations(options.db);

  const { sessionService, workspaceId } = options;
  const issue = await sessionService.issuePairingToken(workspaceId, "loopback");
  const pairingInfo: PairingInfo = {
    port: options.port,
    host: options.host,
    pairingUrl: issue.token.pairingUrl,
    token: issue.token.token,
    sessionId: issue.sessionId,
  };

  const httpServer: Server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    void authenticateUpgrade(req, sessionService, options.originConfig).then((decision) => {
      if (!decision.ok) {
        options.logger.warn("WebSocket upgrade rejected", {
          code: decision.code,
          reason: decision.reason,
          origin: req.headers.origin ?? "",
        });
        socket.write(`HTTP/1.1 ${decision.status} ${decision.reason}\r\n\r\n`);
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        wss.emit("connection", ws, req, decision.session);
      });
    });
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, session: SessionRow) => {
    options.connectionService.register(ws, session.id);
    options.workspaceService.bind(session.id, session.workspace_id);
    options.logger.info("Connection established", { sessionId: session.id });

    const decoder = new TextDecoder();
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        return;
      }
      const buf = Array.isArray(data) ? Buffer.concat(data) : data;
      const raw = decoder.decode(buf);
      void options.protocolHandler.handle(raw, ws).catch((error) => {
        options.logger.error("Protocol handler error", { error: String(error) });
      });
    });

    ws.on("close", () => {
      options.connectionService.unregister(ws);
      options.logger.debug("Connection closed", { sessionId: session.id });
    });

    ws.on("error", (error) => {
      options.logger.error("Socket error", { error: String(error) });
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port, options.host, () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });

  const actualPort = (httpServer.address() as { readonly port: number }).port;
  const resolvedPairingInfo: PairingInfo = {
    ...pairingInfo,
    port: actualPort,
    pairingUrl: `vision-control://pair?token=${encodeURIComponent(issue.token.token)}&port=${actualPort}&host=${options.host}`,
  };
  options.onReady?.(resolvedPairingInfo);

  const stop = async (): Promise<void> => {
    options.connectionService.closeAll();
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
    httpServer.close();
    options.workspaceService.clear();
    options.logger.info("Daemon stopped");
  };

  return { httpServer, pairingInfo: resolvedPairingInfo, stop };
}
