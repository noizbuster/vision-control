import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CompiledContextSchema,
  redactContext,
  redactVisionContextSnapshot,
  renderJson,
  renderMarkdown,
  renderSnapshotJson,
  renderSnapshotMarkdown,
  VisionContextSnapshotSchema,
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
 * Register the `vision_get_source_context` read-only tool (ADR-020 C5).
 *
 * Product path: extension-pushed {@link VisionContextSnapshot} from the
 * projection cache (origins may be empty). Legacy {@link CompiledContext}
 * payloads remain accepted for daemon-era fixtures. Every response is redacted
 * (ADR-009). No source-write/apply tool exists (ADR-010, ADR-012).
 */
export function registerGetSourceContextTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_get_source_context",
    {
      description:
        "Return the compiled extension context snapshot for the current selection as redacted JSON or Markdown. Projection of extension-pushed state (origins may be empty). Unpaired returns not available.",
      inputSchema: getSourceContextInput,
    },
    async (args) => {
      const raw = await deps.getSourceContext();
      if (raw === undefined || raw === null) {
        return errorResult("source context is not available");
      }

      const snapshot = VisionContextSnapshotSchema.safeParse(raw);
      if (snapshot.success) {
        const redacted = redactVisionContextSnapshot(snapshot.data);
        const text =
          args.format === "markdown"
            ? renderSnapshotMarkdown(redacted)
            : renderSnapshotJson(redacted);
        return { content: [{ type: "text" as const, text }] };
      }

      const compiled = CompiledContextSchema.safeParse(raw);
      if (compiled.success) {
        const redacted = redactContext(compiled.data);
        const text = args.format === "markdown" ? renderMarkdown(redacted) : renderJson(redacted);
        return { content: [{ type: "text" as const, text }] };
      }

      return errorResult("source context is not available");
    },
  );
}
