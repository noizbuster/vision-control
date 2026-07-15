/**
 * @vision-control/opencode: OpenCode adapter documentation and config helpers.
 *
 * This package does NOT run the MCP server. It only provides:
 * - typed builders for the `opencode.json#mcp` config (stdio + loopback HTTP)
 * - the constants an agent or doc generator needs to reference the integration
 *
 * The MCP server itself lives in `@vision-control/mcp-server` and is read-only.
 * There is no source-writing tool and there will not be one (ADR-010, ADR-012).
 * No `VC_DAEMON_URL` is required (ADR-020).
 *
 * Platform: node (config is JSON, but the helpers are node-oriented).
 */

export {
  buildHttpEntry,
  buildOpenCodeConfig,
  buildStdioEntry,
  DEFAULT_MCP_HTTP_URL,
  DEFAULT_STDIO_COMMAND,
  type HttpConfigOptions,
  type HttpServerEntry,
  MCP_SERVER_KEY,
  type OpenCodeMcpConfig,
  STDIO_BINARY_PATH,
  type StdioConfigOptions,
  type StdioServerEntry,
  TRANSPORTS,
  type Transport,
} from "./mcp-config.js";

export const PACKAGE_NAME = "@vision-control/opencode";
