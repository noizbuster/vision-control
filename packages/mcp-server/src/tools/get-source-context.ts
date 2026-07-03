import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CompiledContextSchema, redactContext, renderJson } from "@vision-control/context-compiler";
import { errorResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";

/**
 * Register the `vision_get_source_context` read-only tool.
 *
 * Returns the full compiled agent context (compiled by
 * `@vision-control/context-compiler`) as redacted JSON. The context includes
 * the goal, target summary, operations, source candidates, layout, verification
 * plan, warnings, and a privacy report. Every field is redacted before
 * rendering — no secrets leave the server boundary.
 */
export function registerGetSourceContextTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_get_source_context",
    {
      description:
        "Return the compiled agent context for the current selection as redacted JSON. Includes goal, target, operations, source candidates, layout, verification plan, and a privacy report.",
    },
    async () => {
      const raw = await deps.getSourceContext();
      const parsed = CompiledContextSchema.safeParse(raw);
      if (!parsed.success) {
        return errorResult("source context is not available");
      }
      const redacted = redactContext(parsed.data);
      return { content: [{ type: "text" as const, text: renderJson(redacted) }] };
    },
  );
}
