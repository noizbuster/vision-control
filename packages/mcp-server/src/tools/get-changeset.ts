import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";

/**
 * Output schema for `vision_get_changeset` (exported for schema tests).
 *
 * V1 (additive) adds optional per-operation V1 fields: `breakpoint`,
 * `suggestedDiff` (inert), `artifactId`, `groupId`, and `targetCount`. All are
 * optional so a changeset with only MVP operations still validates. No new tool
 * and no source-write tool — the read-only contract is unchanged (ADR-010).
 */
export const GetChangesetOutputSchema = z.object({
  sessionId: z.string(),
  operationCount: z.number(),
  operations: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      runtime: z.boolean(),
      description: z.string(),
      breakpoint: z.string().optional(),
      suggestedDiff: z.string().optional(),
      artifactId: z.string().optional(),
      groupId: z.string().optional(),
      targetCount: z.number().int().nonnegative().optional(),
    }),
  ),
});

/** Register the `vision_get_changeset` read-only tool. */
export function registerGetChangesetTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_get_changeset",
    {
      description:
        "Return the current changeset: operation count and a summary of each operation (id, kind, runtime flag, description, optional V1 details). Read-only.",
    },
    async () => {
      const changeset = await deps.getChangeset();
      return textResult(changeset);
    },
  );
}
