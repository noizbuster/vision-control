/**
 * `vision-control sessions list` — surface the active daemon session.
 *
 * The command name is fixed by PRD §17.2. The MVP daemon tracks a SINGLE
 * active session at a time (one authenticated browser panel), so this surfaces
 * that one session via `vision_get_active_session` rather than enumerating
 * many. When no panel is connected the daemon returns a real `connected: false`
 * record with an explanatory `note` (never fabricated data). V1+ multi-session
 * support would widen this to a true enumeration.
 */

import type { CliContext } from "../context.js";
import { callMcpTool } from "../mcp-client.js";

/** Run the `sessions list` command. Returns an exit code. */
export async function runSessionsList(ctx: CliContext): Promise<number> {
  if (ctx.mcpEndpoint === undefined) {
    process.stderr.write("MCP endpoint not configured. Set VC_MCP_URL and VC_MCP_TOKEN.\n");
    return 1;
  }
  const result = await callMcpTool(ctx.mcpEndpoint, "vision_get_active_session");
  if (!result.ok) {
    process.stderr.write(`failed: ${result.error}\n`);
    return 1;
  }
  process.stdout.write(`${result.text}\n`);
  return 0;
}
