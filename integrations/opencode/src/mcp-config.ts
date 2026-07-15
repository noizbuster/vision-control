/**
 * Programmatic builders for the OpenCode MCP config (the `mcp` block of an
 * `opencode.json`). Output is plain JSON, so it can be written to disk or
 * printed for an agent to paste.
 *
 * The server itself is read-only. These builders only describe how to reach it
 * over stdio or loopback HTTP. They never reference a source-writing tool
 * (none exists; see ADR-010 / ADR-012).
 *
 * No workspace imports: the config shapes are local so this package stays a
 * dependency-free leaf. The real tool list lives in `@vision-control/mcp-server`
 * (`TOOL_NAMES`) and is documented in the README.
 *
 * No `VC_DAEMON_URL`: the MCP process is a projection bridge (ADR-020). Live
 * data arrives when the extension pairs on loopback :4322.
 */

/** Name used as the config key inside `opencode.json#mcp`. */
export const MCP_SERVER_KEY = "vision-control" as const;

/** Transports OpenCode can use to reach the Vision Control MCP server. */
export const TRANSPORTS = ["stdio", "http"] as const;
export type Transport = (typeof TRANSPORTS)[number];

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
  /** Whether OpenCode should enable the server. Defaults to true. */
  readonly enabled?: boolean;
  /** Optional extra environment (never required for product path). */
  readonly environment?: Readonly<Record<string, string>>;
}

/** A complete `opencode.json#mcp["vision-control"]` entry for the stdio transport. */
export interface StdioServerEntry {
  readonly type: "local";
  readonly command: readonly string[];
  readonly enabled: boolean;
  readonly environment?: Readonly<Record<string, string>>;
}

/** Options for a loopback HTTP (url) server entry. */
export interface HttpConfigOptions {
  /** Loopback MCP HTTP endpoint. Defaults to the local port 4322. */
  readonly url?: string;
  /** Bearer token. Read from your own env; never hardcode a real secret. */
  readonly token?: string;
  /** Whether OpenCode should enable the server. Defaults to true. */
  readonly enabled?: boolean;
}

/** A complete `opencode.json#mcp["vision-control"]` entry for the loopback HTTP transport. */
export interface HttpServerEntry {
  readonly type: "url";
  readonly url: string;
  readonly enabled: boolean;
  readonly headers: { readonly Authorization: string };
}

/** The full `opencode.json` mcp block shape with a single server entry. */
export interface OpenCodeMcpConfig {
  readonly mcp: {
    readonly [MCP_SERVER_KEY]: StdioServerEntry | HttpServerEntry;
  };
}

/** Build the stdio server entry for `opencode.json#mcp`. */
export function buildStdioEntry(opts: StdioConfigOptions = {}): StdioServerEntry {
  const command = opts.command ?? DEFAULT_STDIO_COMMAND;
  const enabled = opts.enabled ?? true;
  const entry: StdioServerEntry = {
    type: "local",
    command,
    enabled,
  };
  if (opts.environment && Object.keys(opts.environment).length > 0) {
    return { ...entry, environment: opts.environment };
  }
  return entry;
}

/** Build the loopback HTTP server entry for `opencode.json#mcp`. */
export function buildHttpEntry(opts: HttpConfigOptions = {}): HttpServerEntry {
  const url = opts.url ?? DEFAULT_MCP_HTTP_URL;
  const enabled = opts.enabled ?? true;
  const token = opts.token ?? "change-me";
  return {
    type: "url",
    url,
    enabled,
    headers: { Authorization: `Bearer ${token}` },
  };
}

/** Wrap a server entry in the full `opencode.json#mcp` block. */
export function buildOpenCodeConfig(entry: StdioServerEntry | HttpServerEntry): OpenCodeMcpConfig {
  return { mcp: { [MCP_SERVER_KEY]: entry } };
}
