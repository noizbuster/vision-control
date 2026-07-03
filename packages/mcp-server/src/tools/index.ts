/**
 * Barrel for all MCP tool registrations.
 *
 * Each tool is registered by a `register*Tool(server, deps)` function.
 * `registerAllTools` wires every tool in one call. The tool list is
 * read-only context queries plus coordination signals — NO source-changing
 * tool exists here (PRD section 17.1, docs/agents/mcp-policy.md).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerDeps } from "../types.js";
import { registerCaptureElementTool } from "./capture-element.js";
import { registerClearPreviewTool } from "./clear-preview.js";
import { registerGetActiveSessionTool } from "./get-active-session.js";
import { registerGetChangesetTool } from "./get-changeset.js";
import { registerGetDiagnosticsTool } from "./get-diagnostics.js";
import { registerGetSelectionTool } from "./get-selection.js";
import { registerGetSourceContextTool } from "./get-source-context.js";
import { registerGetVerificationPlanTool } from "./get-verification-plan.js";
import { registerMarkPatchCompletedTool } from "./mark-patch-completed.js";
import { registerMarkPatchStartedTool } from "./mark-patch-started.js";
import { registerRequestVerificationTool } from "./request-verification.js";

/** All read-only and coordination tools exposed by the MCP server. */
export const TOOL_NAMES = [
  "vision_get_active_session",
  "vision_get_selection",
  "vision_get_changeset",
  "vision_get_source_context",
  "vision_get_verification_plan",
  "vision_get_diagnostics",
  "vision_capture_element",
  "vision_request_verification",
  "vision_clear_preview",
  "vision_mark_patch_started",
  "vision_mark_patch_completed",
] as const;

/** Register every MCP tool on `server` using `deps` for data access. */
export function registerAllTools(server: McpServer, deps: McpServerDeps): void {
  registerGetActiveSessionTool(server, deps);
  registerGetSelectionTool(server, deps);
  registerGetChangesetTool(server, deps);
  registerGetSourceContextTool(server, deps);
  registerGetVerificationPlanTool(server, deps);
  registerGetDiagnosticsTool(server, deps);
  registerCaptureElementTool(server, deps);
  registerRequestVerificationTool(server, deps);
  registerClearPreviewTool(server, deps);
  registerMarkPatchStartedTool(server, deps);
  registerMarkPatchCompletedTool(server, deps);
}
