import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";

/** Output schema for `vision_capture_element` (exported for schema tests). */
export const CaptureElementOutputSchema = z.object({
  captured: z.boolean(),
  selector: z.string().optional(),
  sourceId: z.string().optional(),
  note: z.string(),
});

/**
 * Register the `vision_capture_element` tool (redacted, verification-only).
 *
 * Captures the current element context for later verification. The returned
 * data is redacted — no source snippets or secrets are exposed.
 */
export function registerCaptureElementTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_capture_element",
    {
      description:
        "Capture the current element context for verification. Returns a redacted summary (selector, source id, note). Verification-only — does not modify source.",
    },
    async () => {
      const result = await deps.captureElement();
      return textResult(result);
    },
  );
}
