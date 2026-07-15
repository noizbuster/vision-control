import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";
import { CoordinationResultSchema } from "./request-verification.js";

export { CoordinationResultSchema };

/** Input shape for `vision_mark_patch_started`. */
const markPatchStartedInput = {
  patchId: z.string().min(1).describe("Unique identifier for the patch being applied"),
  description: z.string().optional().describe("Human-readable description of the patch"),
};

/**
 * Register the `vision_mark_patch_started` coordination tool.
 *
 * Signals that a source patch has started being applied. This is a coordination
 * signal — it does NOT apply the patch itself. The daemon uses it to track
 * patch lifecycle and prepare verification.
 */
export function registerMarkPatchStartedTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_mark_patch_started",
    {
      description:
        "Enqueue mark_patch_started for the paired extension. Coordination signal only — does not apply or modify source code.",
      inputSchema: markPatchStartedInput,
    },
    async (args) => {
      const result = await deps.markPatchStarted({
        patchId: args.patchId,
        ...(args.description !== undefined ? { description: args.description } : {}),
      });
      return textResult(result);
    },
  );
}
