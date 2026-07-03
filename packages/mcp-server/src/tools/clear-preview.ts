import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { textResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";
import { CoordinationResultSchema } from "./request-verification.js";

export { CoordinationResultSchema };

/**
 * Register the `vision_clear_preview` coordination tool.
 *
 * Clears all runtime preview mutations in the browser. This reverts the
 * preview layer to its pre-edit state — it does NOT modify source code.
 * Used by the verification engine before asserting source-patched state.
 */
export function registerClearPreviewTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_clear_preview",
    {
      description:
        "Clear all runtime preview mutations in the browser. Reverts the preview layer to its pre-edit state. Non-source-changing.",
    },
    async () => {
      const result = await deps.clearPreview();
      return textResult(result);
    },
  );
}
