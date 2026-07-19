/**
 * @vision-control/mcp-server — public API.
 *
 * Read-only MCP server: stdio for agents + loopback discover/bridge on 4322
 * (ADR-020). Projection of extension state; no source-changing tools
 * (ADR-010, docs/agents/mcp-policy.md). Slim C5 tool list (nine names).
 *
 * Platform: node (stdio + HTTP/WS + MCP SDK).
 */

export { PACKAGE_NAME } from "./_package-name.js";
export type { AuthConfig, AuthResult } from "./auth.js";
export { checkAuth } from "./auth.js";
export {
  type StartedMcpProcess,
  type StartMcpProcessOptions,
  startMcpProcess,
} from "./bin.js";
export {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_WS_PATH,
  BridgePortInUseError,
  type BridgeServerHandle,
  type BridgeServerOptions,
  type BridgeSession,
  type BridgeSessionOptions,
  type BuildDiscoverResponseInput,
  buildDiscoverResponse,
  type CommandQueue,
  createBridgeSession,
  createCommandQueue,
  createProjectionCache,
  createProjectionDeps,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  DISCOVER_PATH,
  type DiscoverResponse,
  type EnqueueCommandInput,
  FORBIDDEN_DISCOVER_KEYS,
  formatPairingStderrLines,
  HEARTBEAT_MAX_GAP_MS,
  isLoopbackHost,
  type MintPairTokenOptions,
  minimalSnapshot,
  mintPairToken,
  NonLoopbackHostError,
  PAIR_TOKEN_TTL_MS,
  type PairTokenState,
  type PairTokenValidation,
  type ProjectionCache,
  type ProjectionCacheState,
  type ProjectionDepsOptions,
  type ProjectionEntry,
  printPairingToStderr,
  type QueuedCommand,
  startBridgeServer,
  validateLoopbackHost,
  validatePairToken,
} from "./bridge/index.js";
export { createMcpServer, MCP_SERVER_NAME, MCP_SERVER_VERSION } from "./server.js";
export { createStubDeps } from "./stub-deps.js";
export { errorResult, textResult } from "./tool-helpers.js";
export { registerClearPreviewTool } from "./tools/clear-preview.js";
export {
  GetActiveSessionOutputSchema,
  registerGetActiveSessionTool,
} from "./tools/get-active-session.js";
export { GetChangesetOutputSchema, registerGetChangesetTool } from "./tools/get-changeset.js";
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
  ChangesetOperationSummary,
  ChangesetSummary,
  CoordinationResult,
  McpServerDeps,
  PatchCompletedInput,
  PatchStartedInput,
  SelectionSummary,
  SessionSummary,
  SourceContextSuggestedDiff,
  VerificationPlanSummary,
} from "./types.js";
