/**
 * @vision-control/mcp-server — public API.
 *
 * Read-only MCP server that exposes Vision Control's visual editing context to
 * coding agents over stdio and loopback HTTP. Serves 7 read tools (active
 * session, selection, changeset, source context, verification plan,
 * diagnostics, element capture) and 4 coordination tools (request verification,
 * clear preview, mark patch started/completed).
 *
 * CRITICAL GUARDRAIL: no source-changing tool exists. There is no
 * `vision_apply_deterministic_patch` and there will not be one in the MVP.
 * See docs/agents/mcp-policy.md and PRD section 17.1.
 *
 * Platform: node (uses stdio + HTTP server + the MCP SDK, all node-only).
 */

export { PACKAGE_NAME } from "./_package-name.js";
export type { AuthConfig, AuthResult } from "./auth.js";
export { checkAuth } from "./auth.js";
export {
  type ActiveSessionRead,
  type ChangesetServiceRead,
  type ConnectionServiceDispatch,
  type ContextCompileInput,
  type ContextCompilerRead,
  type CurrentChangesetRead,
  createDaemonMcpDeps,
  type DaemonMcpDepsServices,
  type PreviewClearDispatch,
  type SelectionChangedRead,
  type SessionServiceRead,
  type SourceRegistryServiceRead,
  type VerificationCoordinatorRead,
  type VerificationPlanRead,
  type VerificationRequestedDispatch,
} from "./daemon-deps.js";
export { createMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./server.js";
export { createStubDeps } from "./stub-deps.js";
export { errorResult, textResult } from "./tool-helpers.js";
export {
  CaptureElementOutputSchema,
  registerCaptureElementTool,
} from "./tools/capture-element.js";
export { registerClearPreviewTool } from "./tools/clear-preview.js";
export {
  GetActiveSessionOutputSchema,
  registerGetActiveSessionTool,
} from "./tools/get-active-session.js";
export { GetChangesetOutputSchema, registerGetChangesetTool } from "./tools/get-changeset.js";
export {
  GetDiagnosticsOutputSchema,
  registerGetDiagnosticsTool,
} from "./tools/get-diagnostics.js";
export { GetSelectionOutputSchema, registerGetSelectionTool } from "./tools/get-selection.js";
export { registerGetSourceContextTool } from "./tools/get-source-context.js";
export {
  GetVerificationPlanOutputSchema,
  registerGetVerificationPlanTool,
} from "./tools/get-verification-plan.js";
export { registerAllTools, TOOL_NAMES } from "./tools/index.js";
export { registerMarkPatchCompletedTool } from "./tools/mark-patch-completed.js";
export { registerMarkPatchStartedTool } from "./tools/mark-patch-started.js";
export {
  CoordinationResultSchema,
  registerRequestVerificationTool,
} from "./tools/request-verification.js";
export {
  type HttpTransportHandle,
  type HttpTransportOptions,
  startHttpTransport,
} from "./transports/http.js";
export { startStdioTransport } from "./transports/stdio.js";
export type {
  CaptureResult,
  ChangesetOperationSummary,
  ChangesetSummary,
  CoordinationResult,
  Diagnostic,
  McpServerDeps,
  PatchCompletedInput,
  PatchStartedInput,
  SelectionSummary,
  SessionSummary,
  SourceContextSuggestedDiff,
} from "./types.js";
