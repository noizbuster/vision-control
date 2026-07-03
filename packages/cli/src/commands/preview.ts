/**
 * `vision-control preview clear` — clear all runtime preview mutations.
 */

import type { CliContext } from "../context.js";
import { callMcpTool } from "../mcp-client.js";

/** Run the `preview clear` command. Returns an exit code. */
export async function runPreviewClear(ctx: CliContext): Promise<number> {
  if (ctx.mcpEndpoint === undefined) {
    process.stderr.write("MCP endpoint not configured. Set VC_MCP_URL and VC_MCP_TOKEN.\n");
    return 1;
  }
  const result = await callMcpTool(ctx.mcpEndpoint, "vision_clear_preview");
  if (!result.ok) {
    process.stderr.write(`failed: ${result.error}\n`);
    return 1;
  }
  process.stdout.write(`${result.text}\n`);
  return 0;
}
