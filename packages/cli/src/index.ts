/**
 * @vision-control/cli — Command-line entry point for Vision Control.
 *
 * Parses `process.argv` manually (no external arg-parser dependency for the
 * MVP). Dispatches to command handlers that talk to the daemon over HTTP and
 * the MCP server over its HTTP transport.
 *
 * Platform: node.
 */

export const PACKAGE_NAME = "@vision-control/cli";

export { type CliContext, createContext } from "./context.js";

export const HELP_TEXT = `Vision Control CLI — visual editing context for coding agents.

Usage:
  vision-control <command> [subcommand] [options]

Commands:
  daemon                 Start the Vision Control daemon.
  status                 Show daemon connection status.
  sessions list          List active daemon sessions.
  context current        Show the compiled agent context for the current selection.
    --format json        Output as JSON (default).
    --format markdown    Output as Markdown.
  changes current        Show the current changeset.
  verify current         Request verification of the current changeset.
  preview clear          Clear all runtime preview mutations.
  doctor                 Run health checks.
  help, --help, -h       Show this help.

Environment:
  VC_DAEMON_URL          Daemon base URL (default: http://127.0.0.1:4321).
  VC_MCP_URL             MCP HTTP endpoint URL (e.g. http://127.0.0.1:4322/mcp).
  VC_MCP_TOKEN           MCP session token (Bearer auth).
  VC_DAEMON_BIN          Path to the daemon binary (dist/index.js).
  VC_PLAYGROUND_URL      Playground URL for doctor checks (default: http://127.0.0.1:5173).
`;

/** Parse the top-level command from argv. Returns the command + remaining args. */
export function parseCommand(argv: readonly string[]): {
  readonly command: string | undefined;
  readonly rest: readonly string[];
} {
  if (argv.length === 0) return { command: undefined, rest: [] };
  return { command: argv[0], rest: argv.slice(1) };
}

/** Extract --format value from args. */
export function parseFormat(args: readonly string[]): "json" | "markdown" {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--format" && next === "markdown") return "markdown";
    if (arg === "--format=markdown") return "markdown";
  }
  return "json";
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

  const ctx = createContext();

  switch (command) {
    case "daemon":
      return runDaemon(rest);
    case "status":
      return runStatus(ctx);
    case "sessions":
      return runSessions(rest, ctx);
    case "context":
      return runContext(rest, ctx);
    case "changes":
      return runChanges(rest, ctx);
    case "verify":
      return runVerify(rest, ctx);
    case "preview":
      return runPreview(rest, ctx);
    case "doctor":
      return runDoctor(ctx);
    default:
      process.stderr.write(`unknown command: ${command}\n\n${HELP_TEXT}`);
      return 1;
  }
}

async function runSessions(
  rest: readonly string[],
  ctx: ReturnType<typeof createContext>,
): Promise<number> {
  if (rest[0] !== "list") {
    process.stderr.write("usage: vision-control sessions list\n");
    return 1;
  }
  return runSessionsList(ctx);
}

async function runContext(
  rest: readonly string[],
  ctx: ReturnType<typeof createContext>,
): Promise<number> {
  if (rest[0] !== "current") {
    process.stderr.write("usage: vision-control context current [--format json|markdown]\n");
    return 1;
  }
  return runContextCurrent(ctx, parseFormat(rest));
}

async function runChanges(
  rest: readonly string[],
  ctx: ReturnType<typeof createContext>,
): Promise<number> {
  if (rest[0] !== "current") {
    process.stderr.write("usage: vision-control changes current\n");
    return 1;
  }
  return runChangesCurrent(ctx);
}

async function runVerify(
  rest: readonly string[],
  ctx: ReturnType<typeof createContext>,
): Promise<number> {
  if (rest[0] !== "current") {
    process.stderr.write("usage: vision-control verify current\n");
    return 1;
  }
  return runVerifyCurrent(ctx);
}

async function runPreview(
  rest: readonly string[],
  ctx: ReturnType<typeof createContext>,
): Promise<number> {
  if (rest[0] !== "clear") {
    process.stderr.write("usage: vision-control preview clear\n");
    return 1;
  }
  return runPreviewClear(ctx);
}

import { runChangesCurrent } from "./commands/changes.js";
import { runContextCurrent } from "./commands/context.js";
import { runDaemon } from "./commands/daemon.js";
import { runDoctor } from "./commands/doctor.js";
import { runPreviewClear } from "./commands/preview.js";
import { runSessionsList } from "./commands/sessions.js";
import { runStatus } from "./commands/status.js";
import { runVerifyCurrent } from "./commands/verify.js";
// Import dependencies at the bottom to keep the public API section clean.
// These are used by the dispatch functions above.
import { createContext } from "./context.js";
