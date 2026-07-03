import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";

/** Output schema for `vision_get_diagnostics` (exported for schema tests). */
export const GetDiagnosticsOutputSchema = z.array(
  z.object({
    code: z.string(),
    message: z.string(),
    severity: z.enum(["info", "warning", "error"]),
    source: z.string().optional(),
  }),
);

/** Register the `vision_get_diagnostics` read-only tool. */
export function registerGetDiagnosticsTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_get_diagnostics",
    {
      description:
        "Return diagnostics for the current session: specificity conflicts, stale source markers, low-confidence resolution, and other warnings. Read-only.",
    },
    async () => {
      const diagnostics = await deps.getDiagnostics();
      return textResult(diagnostics);
    },
  );
}
