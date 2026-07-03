/**
 * Stdio transport for the MCP server.
 *
 * Connects the MCP server to `stdin`/`stdout` via `StdioServerTransport` from
 * `@modelcontextprotocol/sdk`. This is the standard transport for local agent
 * integration (OpenCode, Claude Code, Cursor): the client spawns the server as
 * a child process and communicates via JSON-RPC over stdio.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * Connect `server` to stdio. Resolves once the transport is connected.
 * The server then runs until the stdin stream closes (client disconnects).
 */
export async function startStdioTransport(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
