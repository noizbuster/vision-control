import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";

/** Output schema for `vision_get_changeset` (exported for schema tests). */
export const GetChangesetOutputSchema = z.object({
  sessionId: z.string(),
  operationCount: z.number(),
  operations: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      runtime: z.boolean(),
      description: z.string(),
    }),
  ),
});

/** Register the `vision_get_changeset` read-only tool. */
export function registerGetChangesetTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_get_changeset",
    {
      description:
        "Return the current changeset: operation count and a summary of each operation (id, kind, runtime flag, description). Read-only.",
    },
    async () => {
      const changeset = await deps.getChangeset();
      return textResult(changeset);
    },
  );
}
