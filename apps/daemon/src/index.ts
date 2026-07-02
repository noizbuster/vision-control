#!/usr/bin/env node
import { exit } from "node:process";
import { pathToFileURL } from "node:url";

export interface ParsedArgs {
  readonly help: boolean;
  readonly port?: number;
  readonly host?: string;
  readonly workspace?: string;
  readonly db?: string;
}

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 0;

export const HELP_TEXT = `Vision Control daemon — authenticated loopback WebSocket service.

Usage:
  vision-control-daemon [options]

Options:
  --host <host>        Bind host. Loopback only: 127.0.0.1, ::1, localhost.
                       Default: ${DEFAULT_HOST}. Non-loopback hosts are refused.
  --port <port>        Bind port. 0 = ephemeral. Default: ${DEFAULT_PORT}.
  --workspace <path>   Workspace root containing vision-control.config.ts.
                       Default: discovered by walking up from cwd.
  --db <path>          SQLite database path. Default: <workspace>/.vision-control/daemon.db.
  --help               Print this help and exit without binding.

Security:
  - Binds to loopback only (PRD §27.1). --host 0.0.0.0 is refused.
  - Every WebSocket connection must present a valid pairing token.
  - Origins not on the allowlist are rejected before the handshake.
  - Source/context reads require a workspace-bound session.
`;

/** Parse daemon CLI arguments. Pure; returns `{ help: true }` for `--help`. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  let help = false;
  let port: number | undefined;
  let host: string | undefined;
  let workspace: string | undefined;
  let db: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--host") {
      host = next;
      i += 1;
    } else if (arg.startsWith("--host=")) {
      host = arg.slice("--host=".length);
    } else if (arg === "--port") {
      port = next === undefined ? undefined : Number.parseInt(next, 10);
      i += 1;
    } else if (arg.startsWith("--port=")) {
      port = Number.parseInt(arg.slice("--port=".length), 10);
    } else if (arg === "--workspace") {
      workspace = next;
      i += 1;
    } else if (arg.startsWith("--workspace=")) {
      workspace = arg.slice("--workspace=".length);
    } else if (arg === "--db") {
      db = next;
      i += 1;
    } else if (arg.startsWith("--db=")) {
      db = arg.slice("--db=".length);
    }
  }
  return {
    help,
    ...(host !== undefined ? { host } : {}),
    ...(port !== undefined ? { port } : {}),
    ...(workspace !== undefined ? { workspace } : {}),
    ...(db !== undefined ? { db } : {}),
  };
}

/**
 * Daemon entry point. Returns a process exit code.
 *
 * `--help` is handled synchronously before any heavy import so it works even
 * when the daemon's runtime dependencies are not yet built. The real start
 * path lazy-imports the server and storage so the help path stays fast and
 * dependency-free.
 */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const { createDaemonServer, NonLoopbackHostError } = await import("./server.js");
  const { ConsoleLogger, RedactingLogger } = await import("@vision-control/logger");
  const {
    ConnectionService,
    discoverWorkspaceRoot,
    ProtocolHandler,
    SessionService,
    WorkspaceService,
  } = await import("@vision-control/daemon-core");
  const {
    AuditRepository,
    ChangesetRepository,
    runMigrations,
    SessionRepository,
    SourceRegistryRepository,
    WorkspaceRepository,
  } = await import("@vision-control/storage");
  const { defaultAllowlistConfig } = await import("@vision-control/security");
  const { loadConfig } = await import("./config-loader.js");
  const Database = (await import("better-sqlite3")).default;

  const logger = new RedactingLogger(new ConsoleLogger());

  const workspaceRoot = parsed.workspace ?? discoverWorkspaceRoot(process.cwd()) ?? process.cwd();

  const configResult = await loadConfig(workspaceRoot);
  const origins = configResult.success ? configResult.config.origins : [];
  const config = configResult.success ? configResult.config : undefined;

  const resolvedPort = parsed.port ?? config?.daemon.port ?? DEFAULT_PORT;
  const resolvedHost = parsed.host ?? config?.daemon.host ?? DEFAULT_HOST;

  const dbDir = `${workspaceRoot}/.vision-control`;
  const dbPath = parsed.db ?? `${dbDir}/daemon.db`;
  const { mkdirSync } = await import("node:fs");
  try {
    mkdirSync(dbDir, { recursive: true });
  } catch {
    // mkdir may fail if the path is a file db without a dir; the Database
    // constructor surfaces a clearer error in that case.
  }
  const db = new Database(dbPath);
  runMigrations(db);

  const sessionRepo = new SessionRepository(db);
  const auditRepo = new AuditRepository(db);
  const changesetRepo = new ChangesetRepository(db);
  const sourceRepo = new SourceRegistryRepository(db);
  const workspaceRepo = new WorkspaceRepository(db);

  const workspaceId = `ws-${workspaceRoot}`;
  if (workspaceRepo.findById(workspaceId) === undefined) {
    workspaceRepo.insert({
      id: workspaceId,
      path: workspaceRoot,
      name: workspaceRoot,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  }
  void changesetRepo;
  void sourceRepo;

  const sessionService = new SessionService({ sessionRepo, auditRepo, logger });
  const connectionService = new ConnectionService(logger);
  const workspaceService = new WorkspaceService();
  const protocolHandler = new ProtocolHandler({ logger });

  const originConfig = {
    ...defaultAllowlistConfig(),
    ...(origins.length > 0 ? { allowedOrigins: origins } : {}),
  };

  try {
    const server = await createDaemonServer({
      host: resolvedHost,
      port: resolvedPort,
      db,
      workspaceId,
      workspaceRoot,
      sessionService,
      connectionService,
      workspaceService,
      protocolHandler,
      originConfig,
      logger,
      onReady: (info) => {
        process.stdout.write(
          `${JSON.stringify({
            event: "ready",
            port: info.port,
            host: info.host,
            pairingUrl: info.pairingUrl,
            sessionId: info.sessionId,
          })}\n`,
        );
      },
    });

    const shutdown = async (): Promise<void> => {
      await server.stop();
      db.close();
      exit(0);
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());

    return new Promise<number>(() => {
      // long-running: resolves only via signal handlers
    });
  } catch (error) {
    if (error instanceof NonLoopbackHostError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`daemon failed to start: ${message}\n`);
    return 1;
  }
}

const isEntryPoint =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntryPoint) {
  await main().then((code) => {
    if (code !== 0) {
      exit(code);
    }
  });
}
