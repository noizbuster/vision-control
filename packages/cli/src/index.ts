/**
 * @vision-control/cli — Product CLI is the MCP launcher only (ADR-020 C2).
 *
 * `vision-control mcp` spawns the single-process MCP binary (stdio + loopback
 * discover/bridge on 4322). Help is the only other product command. Former
 * daemon/data/doctor/codemod/share commands are rejected with clear errors.
 *
 * Platform: node.
 */

import { runMcp } from "./commands/mcp.js";

export const PACKAGE_NAME = "@vision-control/cli";

export { type RunMcpOptions, resolveMcpBinary, runMcp, type SpawnFn } from "./commands/mcp.js";

/** Commands removed from the product CLI surface (ADR-020). */
export const REMOVED_COMMANDS = [
  "daemon",
  "status",
  "sessions",
  "context",
  "changes",
  "verify",
  "preview",
  "share",
  "codemod",
  "doctor",
] as const;

export type RemovedCommand = (typeof REMOVED_COMMANDS)[number];

const REMOVED_SET: ReadonlySet<string> = new Set(REMOVED_COMMANDS);

export const HELP_TEXT = `Vision Control CLI — MCP launcher for coding agents (ADR-020).

Usage:
  vision-control mcp [args...]
  vision-control help

Commands:
  mcp                    Start the single-process MCP server (stdio + bridge :4322).
  help, --help, -h       Show this help.

Environment:
  VC_MCP_BIN             Path to packages/mcp-server dist/bin.js (optional override).

Notes:
  Pair token prints once on MCP stderr (never stdout). Discover is secret-free
  at http://127.0.0.1:4322/discover. Monorepo health is pnpm check / typecheck /
  test / build — not a product CLI doctor command.
`;

/** Parse the top-level command from argv. Returns the command + remaining args. */
export function parseCommand(argv: readonly string[]): {
  readonly command: string | undefined;
  readonly rest: readonly string[];
} {
  if (argv.length === 0) return { command: undefined, rest: [] };
  return { command: argv[0], rest: argv.slice(1) };
}

function removedCommandMessage(command: string): string {
  if (command === "doctor") {
    return (
      `command "${command}" was removed from the product CLI (ADR-020).\n` +
      "Monorepo health: pnpm check && pnpm typecheck && pnpm test && pnpm build\n" +
      "Start MCP: vision-control mcp\n"
    );
  }
  if (command === "daemon" || command === "status") {
    return (
      `command "${command}" was removed from the product CLI (ADR-020).\n` +
      "There is no product daemon path. Start the MCP bridge: vision-control mcp\n"
    );
  }
  return (
    `command "${command}" was removed from the product CLI (ADR-020).\n` +
    "Agents use MCP tools after pairing the extension. Start MCP: vision-control mcp\n"
  );
}

/**
 * Main CLI entry point. Parses argv, dispatches to the right handler.
 * Returns a process exit code.
 */
export async function runCli(argv: readonly string[]): Promise<number> {
  const { command, rest } = parseCommand(argv);

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  if (command === "mcp") {
    return runMcp(rest);
  }

  if (REMOVED_SET.has(command)) {
    process.stderr.write(removedCommandMessage(command));
    return 1;
  }

  process.stderr.write(`unknown command: ${command}\n\n${HELP_TEXT}`);
  return 1;
}
