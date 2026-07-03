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
 *
 * `privacyReport` carries the redacted privacy summary (PRD §12.2 / Appendix
 * D.6): which fields the redaction engine masks and why. Optional until the
 * engine computes one.
 */
const PrivacyRedactionEntrySchema = z.object({
  field: z.string(),
  patternId: z.string(),
  description: z.string(),
  source: z.enum(["selector", "string-pattern"]),
});

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
  privacyReport: z
    .object({
      totalRedacted: z.number().int().nonnegative(),
      redactions: z.array(PrivacyRedactionEntrySchema),
    })
    .optional(),
});

/** Register the `vision_get_changeset` read-only tool. */
export function registerGetChangesetTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_get_changeset",
    {
      description:
        "Return the current changeset: operation count, a summary of each operation (id, kind, runtime flag, description, optional V1 details), and a redacted privacy report (which fields the redaction engine masks and why). Read-only.",
    },
    async () => {
      const changeset = await deps.getChangeset();
      return textResult(changeset);
    },
  );
}
