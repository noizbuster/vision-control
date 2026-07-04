import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { RedactionConfig } from "@vision-control/context-compiler";
import type {
  ChangesetService,
  ConnectionService,
  ProtocolHandler,
  SessionService,
  SourceRegistryService,
  WorkspaceService,
} from "@vision-control/daemon-core";
import { authenticateUpgrade } from "@vision-control/daemon-core";
import type { Logger } from "@vision-control/logger";
import type { ConnectionServiceDispatch } from "@vision-control/mcp-server";
import {
  type ActiveSessionRead,
  createDaemonMcpDeps,
  createMcpServer,
  type HttpTransportHandle,
  startHttpTransport,
} from "@vision-control/mcp-server";
import { PROTOCOL_VERSION } from "@vision-control/protocol";
import type { OriginAllowlistConfig } from "@vision-control/security";
import type { SessionRow } from "@vision-control/storage";
import { runMigrations } from "@vision-control/storage";
import type Database from "better-sqlite3";
import { type WebSocket, WebSocketServer } from "ws";
import type { PageSessionStore, SelectionStore } from "./business-handlers.js";
import { createDaemonMcpAdapters } from "./mcp-adapters.js";
import type { SourcePipeline } from "./source-pipeline.js";

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
  readonly changesetService: ChangesetService;
  readonly sourceRegistryService: SourceRegistryService;
  /**
   * Source-resolution pipeline (PRD §24.1): workspace index + marker registry +
   * V1 adapter registry + resolver. Wired into the MCP context-compiler and
   * verification-coordinator ports. Optional only when the daemon runs without
   * `--mcp-port`; the WS `source.request` flow uses it when present.
   */
  readonly sourcePipeline?: SourcePipeline;
  /**
   * In-memory last-selection store (per session). When set, the MCP
   * `sessionService.getLastSelection` port reads from it so `vision_get_selection`
   * surfaces the element id from the most recent §25.1.4 `selection.changed`.
   */
  readonly selectionStore?: SelectionStore;
  /**
   * Per-session page-session state (plan task 7). When set, the context-compiler
   * adapter derives the active breakpoint from the session's reported viewport
   * label so the compiled agent context carries a `breakpoint` section.
   */
  readonly pageSessionStore?: PageSessionStore;
  /**
   * Server→client dispatch port for MCP coordination signals. When set, the
   * `vision_request_verification` / `vision_clear_preview` tools emit the
   * matching §25.2 frame to the active session's socket instead of degrading
   * to "not dispatched".
   */
  readonly connectionDispatch?: ConnectionServiceDispatch;
  readonly originConfig: OriginAllowlistConfig;
  readonly logger: Logger;
  /**
   * DOM/selector redaction config (PRD §27.2) sourced from
   * `vision-control.config.ts`. Forwarded to the context-compiler adapter so
   * user `redactionSelectors` extend the PRD defaults at compile time.
   */
  readonly redactionConfig?: RedactionConfig;
  /** MCP HTTP transport port. When set, serves the read-only MCP server over loopback HTTP (ADR-013). */
  readonly mcpPort?: number;
  /** MCP bearer token. When mcpPort is set and this is omitted, a random token is generated. */
  readonly mcpToken?: string;
  /** Called once with the pairing info after the server is listening. */
  readonly onReady?: (info: PairingInfo) => void;
}

export interface PairingInfo {
  readonly port: number;
  readonly host: string;
  readonly pairingUrl: string;
  readonly token: string;
  readonly sessionId: string;
  /** MCP HTTP endpoint URL. Present only when `mcpPort` is set. */
  readonly mcpUrl?: string;
  /** MCP bearer token for the HTTP endpoint. Present only when `mcpPort` is set. */
  readonly mcpToken?: string;
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
 *
 * When `mcpPort` is set, also starts the read-only MCP HTTP transport on a
 * separate loopback port with its own bearer token (ADR-013). The MCP server
 * reads live session state from the tracked WebSocket connections.
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

  // Tracked by the WS connection/close handlers; read by the MCP deps adapter
  // closure so vision_get_active_session reflects live connection state.
  let activeSession: { readonly sessionId: string; readonly workspaceId: string } | undefined;

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
    activeSession = { sessionId: session.id, workspaceId: session.workspace_id };
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
      if (activeSession !== undefined && activeSession.sessionId === session.id) {
        activeSession = undefined;
      }
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

  // Start the MCP HTTP transport on a separate loopback port (ADR-013). The
  // deps adapter is a closure over `activeSession`, so MCP reads reflect live
  // WebSocket connection state without coupling mcp-server to daemon-core.
  let mcpTransport: HttpTransportHandle | undefined;
  let mcpUrl: string | undefined;
  let mcpToken: string | undefined;
  if (options.mcpPort !== undefined) {
    mcpToken = options.mcpToken ?? randomBytes(32).toString("hex");
    const serviceAdapters = createDaemonMcpAdapters({
      changesetService: options.changesetService,
      sourceRegistryService: options.sourceRegistryService,
      ...(options.sourcePipeline !== undefined
        ? {
            resolver: options.sourcePipeline.resolver,
            registry: options.sourcePipeline.registry,
            tokenRegistry: options.sourcePipeline.tokenRegistry,
            workspaceRoot: options.workspaceRoot,
            logger: options.logger,
          }
        : {}),
      ...(options.pageSessionStore !== undefined
        ? { pageSessionStore: options.pageSessionStore }
        : {}),
      ...(options.redactionConfig !== undefined
        ? { redactionConfig: options.redactionConfig }
        : {}),
    });
    const mcpDeps = createDaemonMcpDeps({
      sessionService: {
        async getActive(): Promise<ActiveSessionRead | undefined> {
          if (activeSession === undefined) return undefined;
          return {
            sessionId: activeSession.sessionId,
            workspaceId: activeSession.workspaceId,
            connected: true,
            protocolVersion: PROTOCOL_VERSION,
          };
        },
        ...(options.selectionStore !== undefined
          ? {
              getLastSelection: async (sessionId: string) => options.selectionStore?.get(sessionId),
            }
          : {}),
      },
      ...(options.connectionDispatch !== undefined
        ? { connectionService: options.connectionDispatch }
        : {}),
      ...serviceAdapters,
    });
    const mcpServer = createMcpServer(mcpDeps);
    mcpTransport = await startHttpTransport(mcpServer, {
      port: options.mcpPort,
      host: options.host,
      auth: { token: mcpToken },
    });
    mcpUrl = `http://${options.host}:${mcpTransport.port}/mcp`;
    options.logger.info("MCP HTTP transport started", { mcpUrl });
  }

  const resolvedPairingInfo: PairingInfo = {
    ...pairingInfo,
    port: actualPort,
    pairingUrl: `vision-control://pair?token=${encodeURIComponent(issue.token.token)}&port=${actualPort}&host=${options.host}`,
    ...(mcpUrl !== undefined ? { mcpUrl } : {}),
    ...(mcpToken !== undefined ? { mcpToken } : {}),
  };
  options.onReady?.(resolvedPairingInfo);

  const stop = async (): Promise<void> => {
    if (mcpTransport !== undefined) {
      await mcpTransport.stop();
    }
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
