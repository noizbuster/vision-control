/**
 * Barrel for all MCP tool registrations (ADR-020 C5).
 *
 * Exact product tool list: nine names. Prefer absent from TOOL_NAMES over empty
 * stubs for dropped tools (`vision_capture_element`, `vision_get_diagnostics`).
 * Read-only context queries plus coordination signals — NO source-changing tool
 * (PRD section 17.1, docs/agents/mcp-policy.md).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerDeps } from "../types.js";
import { registerClearPreviewTool } from "./clear-preview.js";
import { registerGetActiveSessionTool } from "./get-active-session.js";
import { registerGetChangesetTool } from "./get-changeset.js";
import { registerGetSelectionTool } from "./get-selection.js";
import { registerGetSourceContextTool } from "./get-source-context.js";
import { registerGetVerificationPlanTool } from "./get-verification-plan.js";
import { registerMarkPatchCompletedTool } from "./mark-patch-completed.js";
import { registerMarkPatchStartedTool } from "./mark-patch-started.js";
import { registerRequestVerificationTool } from "./request-verification.js";

/**
 * ADR-020 C5 exact product tool names (nine). Order matches mcp-policy.md.
 * Dropped: vision_capture_element, vision_get_diagnostics.
 */
export const TOOL_NAMES = [
  "vision_get_active_session",
  "vision_get_selection",
  "vision_get_changeset",
  "vision_get_source_context",
  "vision_get_verification_plan",
  "vision_clear_preview",
  "vision_request_verification",
  "vision_mark_patch_started",
  "vision_mark_patch_completed",
] as const;

/** Register every C5 MCP tool on `server` using `deps` for data access. */
export function registerAllTools(server: McpServer, deps: McpServerDeps): void {
  registerGetActiveSessionTool(server, deps);
  registerGetSelectionTool(server, deps);
  registerGetChangesetTool(server, deps);
  registerGetSourceContextTool(server, deps);
  registerGetVerificationPlanTool(server, deps);
  registerClearPreviewTool(server, deps);
  registerRequestVerificationTool(server, deps);
  registerMarkPatchStartedTool(server, deps);
  registerMarkPatchCompletedTool(server, deps);
}
