/**
 * MCP server factory.
 *
 * `createMcpServer(deps)` creates an `McpServer` from `@modelcontextprotocol/sdk`
 * and registers every read-only and coordination tool. The tools are
 * transport-agnostic: the same server can be served over stdio (for local
 * agent integration) or loopback HTTP (for CLI and tooling).
 *
 * The `deps` interface is injected — the daemon wires a real implementation
 * that reads from storage/protocol, while tests inject a fake. This keeps the
 * MCP server free of daemon coupling and makes every tool unit-testable.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerAllTools } from "./tools/index.js";
import type { McpServerDeps } from "./types.js";

export const MCP_SERVER_NAME = "@vision-control/mcp-server";
export const MCP_SERVER_VERSION = "0.0.0";

/**
 * Create an MCP server with all read-only and coordination tools registered.
 *
 * The returned `McpServer` is NOT yet connected to a transport. Call
 * `startStdioTransport(server)` or `startHttpTransport(server, opts)` to serve
 * it.
 */
export function createMcpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });
  registerAllTools(server, deps);
  return server;
}
