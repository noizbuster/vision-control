import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";

/** Output schema for `vision_get_selection` (exported for schema tests). */
export const GetSelectionOutputSchema = z.object({
  sessionId: z.string(),
  elementTag: z.string(),
  selector: z.string().optional(),
  sourceId: z.string().optional(),
  textPreview: z.string().optional(),
});

/** Register the `vision_get_selection` read-only tool (redacted). */
export function registerGetSelectionTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_get_selection",
    {
      description:
        "Return the currently selected element summary: tag, selector, source id, and text preview. Redacted.",
    },
    async () => {
      const selection = await deps.getSelection();
      return textResult(selection);
    },
  );
}
