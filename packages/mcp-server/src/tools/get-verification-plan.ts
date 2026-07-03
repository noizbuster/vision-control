import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";

/** Output schema for `vision_get_verification_plan` (exported for schema tests). */
export const GetVerificationPlanOutputSchema = z.object({
  assertions: z.array(z.object({ description: z.string() })),
  notes: z.string(),
});

/** Register the `vision_get_verification_plan` read-only tool. */
export function registerGetVerificationPlanTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_get_verification_plan",
    {
      description:
        "Return the verification plan for the current changeset: a list of assertions and notes. Read-only.",
    },
    async () => {
      const plan = await deps.getVerificationPlan();
      return textResult(plan);
    },
  );
}
