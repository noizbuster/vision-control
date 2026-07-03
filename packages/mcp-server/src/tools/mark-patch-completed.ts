import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";
import { CoordinationResultSchema } from "./request-verification.js";

export { CoordinationResultSchema };

/** Input shape for `vision_mark_patch_completed`. */
const markPatchCompletedInput = {
  patchId: z.string().min(1).describe("Unique identifier for the completed patch"),
  success: z.boolean().describe("Whether the patch was applied successfully"),
};

/**
 * Register the `vision_mark_patch_completed` coordination tool.
 *
 * Signals that a source patch has completed. Triggers the verification engine
 * to assert the source-patched state matches expectations. This is a
 * coordination signal — it does NOT modify source code itself.
 */
export function registerMarkPatchCompletedTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_mark_patch_completed",
    {
      description:
        "Signal that a source patch has completed. Triggers verification of the source-patched state. Coordination signal only — does not modify source code.",
      inputSchema: markPatchCompletedInput,
    },
    async (args) => {
      const result = await deps.markPatchCompleted({
        patchId: args.patchId,
        success: args.success,
      });
      return textResult(result);
    },
  );
}
