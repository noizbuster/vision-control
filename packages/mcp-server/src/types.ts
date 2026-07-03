/**
 * Dependency interface injected into the MCP server. Every tool handler calls
 * one of these methods to read state or signal a coordination event.
 *
 * The interface is deliberately transport-agnostic: the daemon wires a real
 * implementation (reading from storage/protocol), while tests inject a fake.
 * This keeps the MCP server free of daemon/runtime coupling and makes every
 * tool unit-testable without a running daemon.
 *
 * CRITICAL: none of these methods mutate source code. The tools are read-only
 * context queries plus coordination signals (request verification, clear
 * preview, mark patch lifecycle). There is NO apply-patch method by design
 * (PRD section 17.1, ADR-008, docs/agents/mcp-policy.md).
 */

/** Active daemon session summary returned by `vision_get_active_session`. */
export interface SessionSummary {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly connected: boolean;
  readonly clientVersion?: string;
  readonly protocolVersion: string;
}

/** Redacted selection summary returned by `vision_get_selection`. */
export interface SelectionSummary {
  readonly sessionId: string;
  readonly elementTag: string;
  readonly selector: string | undefined;
  readonly sourceId: string | undefined;
  readonly textPreview: string | undefined;
}

/** Changeset summary returned by `vision_get_changeset`. */
export interface ChangesetSummary {
  readonly sessionId: string;
  readonly operationCount: number;
  readonly operations: readonly ChangesetOperationSummary[];
}

/** One operation in a changeset, reduced to agent-facing essentials. */
export interface ChangesetOperationSummary {
  readonly id: string;
  readonly kind: string;
  readonly runtime: boolean;
  readonly description: string;
}

/** Diagnostic returned by `vision_get_diagnostics`. */
export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: "info" | "warning" | "error";
  readonly source: string | undefined;
}

/** Result of `vision_capture_element` (redacted, verification-only). */
export interface CaptureResult {
  readonly captured: boolean;
  readonly selector: string | undefined;
  readonly sourceId: string | undefined;
  readonly note: string;
}

/** Result of a coordination tool (request-verification, clear-preview, etc.). */
export interface CoordinationResult {
  readonly acknowledged: boolean;
  readonly message: string;
}

/** Input for `vision_mark_patch_started`. */
export interface PatchStartedInput {
  readonly patchId: string;
  readonly description?: string;
}

/** Input for `vision_mark_patch_completed`. */
export interface PatchCompletedInput {
  readonly patchId: string;
  readonly success: boolean;
}

/**
 * Injected dependencies for the MCP server tools. Each method is async so the
 * implementation can read from storage, the protocol layer, or a remote daemon.
 */
export interface McpServerDeps {
  getActiveSession(): Promise<SessionSummary>;
  getSelection(): Promise<SelectionSummary>;
  getChangeset(): Promise<ChangesetSummary>;
  getSourceContext(): Promise<unknown>;
  getVerificationPlan(): Promise<{
    readonly assertions: readonly { readonly description: string }[];
    readonly notes: string;
  }>;
  getDiagnostics(): Promise<readonly Diagnostic[]>;
  captureElement(): Promise<CaptureResult>;
  requestVerification(): Promise<CoordinationResult>;
  clearPreview(): Promise<CoordinationResult>;
  markPatchStarted(input: PatchStartedInput): Promise<CoordinationResult>;
  markPatchCompleted(input: PatchCompletedInput): Promise<CoordinationResult>;
}
