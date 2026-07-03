/**
 * `vision-control changes current` — show the current changeset.
 */

import type { CliContext } from "../context.js";
import { callMcpTool } from "../mcp-client.js";

/** Run the `changes current` command. Returns an exit code. */
export async function runChangesCurrent(ctx: CliContext): Promise<number> {
  if (ctx.mcpEndpoint === undefined) {
    process.stderr.write("MCP endpoint not configured. Set VC_MCP_URL and VC_MCP_TOKEN.\n");
    return 1;
  }
  const result = await callMcpTool(ctx.mcpEndpoint, "vision_get_changeset");
  if (!result.ok) {
    process.stderr.write(`failed: ${result.error}\n`);
    return 1;
  }
  process.stdout.write(`${result.text}\n`);
  return 0;
}
