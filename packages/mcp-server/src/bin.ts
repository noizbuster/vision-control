#!/usr/bin/env node
/**
 * MCP server binary entry point.
 *
 * Serves the Vision Control MCP server over stdio for local agent integration
 * (OpenCode, Claude Code, Cursor, generic stdio MCP). The agent spawns this
 * binary as a child process and communicates via JSON-RPC over stdin/stdout.
 *
 * When `VC_DAEMON_URL` is set, the server connects to the daemon for live data.
 * Otherwise it uses stub deps (every tool responds with "no daemon connected").
 *
 * Usage:
 *   vision-control-mcp                    # stdio transport, stub deps
 *   VC_DAEMON_URL=ws://... vision-control-mcp  # stdio transport, daemon deps
 */

import { createMcpServer } from "./server.js";
import { createStubDeps } from "./stub-deps.js";
import { startStdioTransport } from "./transports/stdio.js";

async function main(): Promise<void> {
  const deps = createStubDeps();
  const server = createMcpServer(deps);
  await startStdioTransport(server);
}

await main();
