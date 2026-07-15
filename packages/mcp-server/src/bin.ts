#!/usr/bin/env node
/**
 * MCP server binary entry point (ADR-020 C2/C3).
 *
 * One process serves:
 *   1. stdio → coding agent (MCP JSON-RPC on stdout)
 *   2. loopback HTTP discovery: GET http://127.0.0.1:4322/discover
 *   3. loopback WebSocket pair+bridge: ws://127.0.0.1:4322/bridge
 *
 * Pair token is printed once on stderr only. Never on stdout (reserved for
 * agent JSON-RPC). Never in the discover body. No VC_DAEMON_URL required.
 */

import { fileURLToPath } from "node:url";

import {
  BridgePortInUseError,
  type BridgeServerHandle,
  createBridgeSession,
  createCommandQueue,
  createProjectionCache,
  createProjectionDeps,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  mintPairToken,
  NonLoopbackHostError,
  printPairingToStderr,
  startBridgeServer,
} from "./bridge/index.js";
import { createMcpServer } from "./server.js";
import { startStdioTransport } from "./transports/stdio.js";

export interface StartMcpProcessOptions {
  /** Override bind host (must be loopback). */
  readonly host?: string;
  /** Override bind port (default 4322; use 0 in tests). */
  readonly port?: number;
  /** Injectable stderr writer (defaults to process.stderr). */
  readonly writeStderr?: (line: string) => void;
  /** Skip stdio transport (tests that only need the bridge). */
  readonly skipStdio?: boolean;
  /** Injectable clock for pair-token TTL. */
  readonly now?: () => number;
  /** Override pair-token TTL (tests). */
  readonly pairTokenTtlMs?: number;
}

export interface StartedMcpProcess {
  readonly host: string;
  readonly port: number;
  readonly pairToken: string;
  readonly stop: () => Promise<void>;
}

/**
 * Start the single-process MCP bridge + optional stdio transport.
 * Does not require a daemon or VC_DAEMON_URL.
 */
export async function startMcpProcess(
  options: StartMcpProcessOptions = {},
): Promise<StartedMcpProcess> {
  const host = options.host ?? DEFAULT_BRIDGE_HOST;
  const port = options.port ?? DEFAULT_BRIDGE_PORT;
  const writeStderr = options.writeStderr ?? ((line: string) => process.stderr.write(`${line}\n`));
  const now = options.now ?? Date.now;

  const pairToken = mintPairToken({
    now: options.now,
    ttlMs: options.pairTokenTtlMs,
  });

  const cache = createProjectionCache();
  const commands = createCommandQueue();
  const session = createBridgeSession({ cache, commands, now });
  const deps = createProjectionDeps({
    cache,
    commands,
    now,
    sendCommand: (payload) => session.sendCommand(payload),
  });

  let bridge: BridgeServerHandle;
  try {
    bridge = await startBridgeServer({
      host,
      port,
      pairToken,
      now: options.now,
      onPaired: (socket) => {
        session.attach(socket);
      },
    });
  } catch (error) {
    if (error instanceof NonLoopbackHostError || error instanceof BridgePortInUseError) {
      writeStderr(error.message);
    }
    throw error;
  }

  // Pair material: stderr only, after bind so the printed port is real.
  printPairingToStderr(pairToken, bridge.host, bridge.port, writeStderr);

  const server = createMcpServer(deps);

  if (options.skipStdio !== true) {
    await startStdioTransport(server);
  }

  return {
    host: bridge.host,
    port: bridge.port,
    pairToken: pairToken.token,
    stop: async () => {
      session.detach();
      await bridge.stop();
      if (options.skipStdio !== true) {
        await server.close();
      }
    },
  };
}

async function main(): Promise<void> {
  try {
    await startMcpProcess();
  } catch (error) {
    if (!(error instanceof NonLoopbackHostError || error instanceof BridgePortInUseError)) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[vision-control-mcp] fatal: ${message}\n`);
    }
    process.exitCode = 1;
  }
}

// Only run when executed directly. Guarded so unit tests can import helpers
// without starting stdio + bridge.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
