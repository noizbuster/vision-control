#!/usr/bin/env node
/**
 * MCP server binary entry point.
 *
 * Serves the Vision Control MCP server over stdio for local agent integration
 * (OpenCode, Claude Code, Cursor, generic stdio MCP). The agent spawns this
 * binary as a child process and communicates via JSON-RPC over stdin/stdout.
 *
 * Deps selection honors `VC_DAEMON_URL`:
 *   - Set         → the server reads live session/changeset data from the daemon
 *                   over loopback HTTP (`createHttpDaemonServices`).
 *   - Unset/empty → the server falls back to stub deps AND prints a warning to
 *                   stderr so the fallback is never a silent false claim.
 *
 * Usage:
 *   vision-control-mcp                                        # stub deps (warns on stderr)
 *   VC_DAEMON_URL=http://127.0.0.1:4321 vision-control-mcp    # live daemon data
 */

import { fileURLToPath } from "node:url";
import { createDaemonMcpDeps } from "./daemon-deps.js";
import { createHttpDaemonServices, type DaemonHttpFetch } from "./http-daemon-deps.js";
import { createMcpServer } from "./server.js";
import { createStubDeps } from "./stub-deps.js";
import { startStdioTransport } from "./transports/stdio.js";
import type { McpServerDeps } from "./types.js";

export const STUB_WARNING =
  "VC_DAEMON_URL not set — serving stub data. Set VC_DAEMON_URL to connect to a live daemon.";

export interface ResolveDepsOptions {
  /** Override the HTTP fetch used by the daemon client (tests inject a fake). */
  readonly fetch?: DaemonHttpFetch;
}

export interface ResolvedDeps {
  readonly deps: McpServerDeps;
  /** True when no daemon URL was configured and stub deps were selected. */
  readonly warned: boolean;
}

/**
 * Select MCP deps from the environment. Pure and side-effect-free so it is
 * unit-testable without spawning the stdio transport.
 *
 * A non-empty `VC_DAEMON_URL` selects daemon-backed deps that read live data
 * over loopback HTTP; anything else selects stub deps and flags a warning.
 */
export function resolveMcpDeps(
  env: NodeJS.ProcessEnv,
  options: ResolveDepsOptions = {},
): ResolvedDeps {
  const daemonUrl = env.VC_DAEMON_URL;
  if (typeof daemonUrl === "string" && daemonUrl.length > 0) {
    const services = createHttpDaemonServices(daemonUrl, options);
    return { deps: createDaemonMcpDeps(services), warned: false };
  }
  return { deps: createStubDeps(), warned: true };
}

/** Emit the stub warning to `write` when the daemon URL was absent. */
export function maybeWarnStub(warned: boolean, write: (line: string) => void): void {
  if (warned) write(STUB_WARNING);
}

async function main(): Promise<void> {
  const { deps, warned } = resolveMcpDeps(process.env);
  maybeWarnStub(warned, (line) => process.stderr.write(`${line}\n`));
  const server = createMcpServer(deps);
  await startStdioTransport(server);
}

// Only run when executed directly (node dist/bin.js). Guarded so unit tests can
// import `resolveMcpDeps` / `STUB_WARNING` without starting the stdio transport.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
