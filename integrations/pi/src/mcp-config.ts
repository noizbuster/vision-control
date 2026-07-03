/**
 * Programmatic builders for the Pi MCP config (a server-entry object that
 * describes how Pi reaches the Vision Control MCP server over stdio or loopback
 * HTTP). Output is plain JSON, so it can be written to Pi's MCP settings or
 * printed for an agent to paste.
 *
 * The server itself is read-only. These builders only describe how to reach it.
 * They never reference a source-writing tool (none exists; ADR-010 / ADR-012).
 *
 * No workspace imports: the config shapes are local so this package stays a
 * dependency-free leaf. The real tool list lives in `@vision-control/mcp-server`
 * (`TOOL_NAMES`) and is documented in the README.
 *
 * Note on Pi's config schema: Pi's MCP client settings evolve independently of
 * this repo. Map the emitted `command`/`url`/`headers` fields onto Pi's current
 * server-entry shape. The transport contract (stdio spawn, or loopback HTTP URL
 * behind a Bearer token) is what matters and is stable.
 */

/** Label used for this server in agent-facing config. */
export const MCP_SERVER_LABEL = "vision-control" as const;

/** Transports Pi can use to reach the Vision Control MCP server. */
export const TRANSPORTS = ["stdio", "http"] as const;
export type Transport = (typeof TRANSPORTS)[number];

/** Default daemon URL the MCP server reads live page state from. */
export const DEFAULT_DAEMON_URL = "http://127.0.0.1:4321";

/** Default loopback MCP HTTP endpoint (ADR-013: bound to 127.0.0.1 only). */
export const DEFAULT_MCP_HTTP_URL = "http://127.0.0.1:4322/mcp";

/** Default command that spawns the stdio MCP server binary. */
export const DEFAULT_STDIO_COMMAND: readonly string[] = ["pnpm", "exec", "vision-control-mcp"];

/** Full source path to the stdio binary, for agents running outside the workspace. */
export const STDIO_BINARY_PATH = "packages/mcp-server/dist/bin.js";

/** Options for a stdio (local spawn) server entry. */
export interface StdioConfigOptions {
  /** Spawn command. Defaults to the workspace `pnpm exec` invocation. */
  readonly command?: readonly string[];
  /** Daemon URL passed to the server so it reads live data. */
  readonly daemonUrl?: string;
}

/** A stdio server entry: spawn the binary, talk JSON-RPC over stdin/stdout. */
export interface StdioServerEntry {
  readonly transport: "stdio";
  readonly command: readonly string[];
  readonly environment: { readonly VC_DAEMON_URL: string };
}

/** Options for a loopback HTTP server entry. */
export interface HttpConfigOptions {
  /** Loopback MCP HTTP endpoint. Defaults to the local port 4322. */
  readonly url?: string;
  /** Bearer token. Read from your own env; never hardcode a real secret. */
  readonly token?: string;
}

/** A loopback HTTP server entry: POST JSON-RPC to a 127.0.0.1 endpoint. */
export interface HttpServerEntry {
  readonly transport: "http";
  readonly url: string;
  readonly headers: { readonly Authorization: string };
}

/** Build the stdio server entry for Pi's MCP settings. */
export function buildStdioEntry(opts: StdioConfigOptions = {}): StdioServerEntry {
  const command = opts.command ?? DEFAULT_STDIO_COMMAND;
  const daemonUrl = opts.daemonUrl ?? DEFAULT_DAEMON_URL;
  return {
    transport: "stdio",
    command,
    environment: { VC_DAEMON_URL: daemonUrl },
  };
}

/** Build the loopback HTTP server entry for Pi's MCP settings. */
export function buildHttpEntry(opts: HttpConfigOptions = {}): HttpServerEntry {
  const url = opts.url ?? DEFAULT_MCP_HTTP_URL;
  const token = opts.token ?? "change-me";
  return {
    transport: "http",
    url,
    headers: { Authorization: `Bearer ${token}` },
  };
}

/** Wrap a server entry under the vision-control label. */
export function buildPiConfig(entry: StdioServerEntry | HttpServerEntry): {
  readonly servers: { readonly [K in typeof MCP_SERVER_LABEL]: typeof entry };
} {
  return { servers: { [MCP_SERVER_LABEL]: entry } };
}
