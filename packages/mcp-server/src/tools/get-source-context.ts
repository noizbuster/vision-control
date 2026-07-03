import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CompiledContextSchema,
  redactContext,
  renderJson,
  renderMarkdown,
} from "@vision-control/context-compiler";
import { z } from "zod";
import { errorResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";

const getSourceContextInput = {
  format: z
    .enum(["json", "markdown"])
    .optional()
    .describe("Output format: json (default) or markdown"),
};

/**
 * Register the `vision_get_source_context` read-only tool.
 *
 * Returns the full compiled agent context (compiled by
 * `@vision-control/context-compiler`) as redacted JSON or Markdown. The context
 * includes the goal, target summary, operations, source candidates, layout,
 * verification plan, warnings, privacy report, and all V1 fields (multi-select
 * targets, breakpoint context, source confidence detail, suggested diffs as
 * inert data, screenshot metadata ref when opted in, layout/grid/auto-layout
 * context, adapter warnings, token registry, component props). Every field is
 * redacted before rendering (ADR-009). No screenshot image data is ever
 * exposed; only an opt-in metadata ref (ADR-011). No source-write/apply tool
 * exists (ADR-010, ADR-012).
 */
export function registerGetSourceContextTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_get_source_context",
    {
      description:
        "Return the compiled agent context for the current selection as redacted JSON or Markdown. Includes goal, target, operations, source candidates, layout, verification plan, V1 details (multi-select, breakpoint, confidence, suggested diffs, screenshot metadata ref, grid/auto-layout, adapter warnings), and a privacy report.",
      inputSchema: getSourceContextInput,
    },
    async (args) => {
      const raw = await deps.getSourceContext();
      const parsed = CompiledContextSchema.safeParse(raw);
      if (!parsed.success) {
        return errorResult("source context is not available");
      }
      const redacted = redactContext(parsed.data);
      const text = args.format === "markdown" ? renderMarkdown(redacted) : renderJson(redacted);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
