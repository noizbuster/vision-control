import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";

/** Output schema for coordination tools (exported for schema tests). */
export const CoordinationResultSchema = z.object({
  acknowledged: z.boolean(),
  message: z.string(),
});

/**
 * Register the `vision_request_verification` coordination tool.
 *
 * Signals the daemon to run the verification engine against the current
 * changeset. This is NOT a source mutation — it triggers read-only assertions
 * after HMR. No source code is changed.
 */
export function registerRequestVerificationTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_request_verification",
    {
      description:
        "Enqueue a request_verification command for the paired extension. Non-source-changing coordination signal; unpaired returns not_paired.",
    },
    async () => {
      const result = await deps.requestVerification();
      return textResult(result);
    },
  );
}
