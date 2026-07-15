import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult } from "../tool-helpers.js";
import type { McpServerDeps } from "../types.js";

/** Output schema for `vision_get_active_session` (exported for schema tests). */
export const GetActiveSessionOutputSchema = z.object({
  sessionId: z.string(),
  workspaceId: z.string(),
  connected: z.boolean(),
  clientVersion: z.string().optional(),
  protocolVersion: z.string(),
  note: z.string().optional(),
});

/** Register the `vision_get_active_session` read-only tool. */
export function registerGetActiveSessionTool(server: McpServer, deps: McpServerDeps): void {
  server.registerTool(
    "vision_get_active_session",
    {
      description:
        "Return the active extension session projection: session id, workspace, connection state, and protocol version. Read-only. Unpaired returns connected:false with note not_paired.",
    },
    async () => {
      const session = await deps.getActiveSession();
      return textResult(session);
    },
  );
}
