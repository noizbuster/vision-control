/**
 * `vision-control context current --format json|markdown` — show compiled
 * agent context for the current selection.
 */

import { CompiledContextSchema, renderMarkdown } from "@vision-control/context-compiler";

import type { CliContext } from "../context.js";
import { callMcpTool } from "../mcp-client.js";

export type ContextFormat = "json" | "markdown";

/** Run the `context current` command. Returns an exit code. */
export async function runContextCurrent(ctx: CliContext, format: ContextFormat): Promise<number> {
  if (ctx.mcpEndpoint === undefined) {
    process.stderr.write("MCP endpoint not configured. Set VC_MCP_URL and VC_MCP_TOKEN.\n");
    return 1;
  }
  const result = await callMcpTool(ctx.mcpEndpoint, "vision_get_source_context");
  if (!result.ok) {
    process.stderr.write(`failed: ${result.error}\n`);
    return 1;
  }

  if (format === "markdown") {
    const parsed = CompiledContextSchema.safeParse(JSON.parse(result.text));
    if (parsed.success) {
      process.stdout.write(`${renderMarkdown(parsed.data)}\n`);
      return 0;
    }
    process.stderr.write("warning: context did not validate; falling back to JSON\n");
  }
  process.stdout.write(`${result.text}\n`);
  return 0;
}
