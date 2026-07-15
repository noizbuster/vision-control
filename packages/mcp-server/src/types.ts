/**
 * Dependency interface injected into the MCP server. Every tool handler calls
 * one of these methods to read state or signal a coordination event.
 *
 * Transport-agnostic: projection cache (ADR-020), daemon adapters, or test
 * fakes. Free of daemon/runtime coupling so every tool is unit-testable.
 *
 * CRITICAL: none of these methods mutate source code. Tools are read-only
 * context queries plus coordination signals. There is NO apply-patch method
 * (PRD section 17.1, ADR-008, docs/agents/mcp-policy.md). Capture/diagnostics
 * are not product tools (ADR-020 C5).
 */

/** Active session summary returned by `vision_get_active_session`. */
export interface SessionSummary {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly connected: boolean;
  readonly clientVersion?: string;
  readonly protocolVersion: string;
  /** Explanatory note when `connected` is false (e.g. not_paired). */
  readonly note?: string;
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
  /**
   * Redacted privacy summary for the changeset (PRD §12.2 / Appendix D.6):
   * which fields the redaction engine would mask and why. Absent until the
   * engine computes one. The report never carries original secret values.
   */
  readonly privacyReport?: ChangesetPrivacyReport;
}

/** Privacy report surfaced on the changeset summary (mirrors change-ir). */
export interface ChangesetPrivacyReport {
  readonly totalRedacted: number;
  readonly redactions: readonly {
    readonly field: string;
    readonly patternId: string;
    readonly description: string;
    readonly source: "selector" | "string-pattern";
  }[];
}

/** One operation in a changeset, reduced to agent-facing essentials. */
export interface ChangesetOperationSummary {
  readonly id: string;
  readonly kind: string;
  readonly runtime: boolean;
  readonly description: string;
  /** V1: breakpoint identifier for breakpoint-scoped operations. */
  readonly breakpoint?: string;
  /** V1 (inert): suggested-diff text for suggested-diff operations (ADR-012, never applied). */
  readonly suggestedDiff?: string;
  /** V1: screenshot artifact id for screenshot-crop-ref operations. */
  readonly artifactId?: string;
  /** V1: group id for multi-select-group operations. */
  readonly groupId?: string;
  /** V1: number of elements targeted by a group/multi-select operation. */
  readonly targetCount?: number;
}

/**
 * V1 (inert): one deterministic patch suggestion surfaced through the
 * `vision_get_source_context` response as candidate DATA (ADR-012). The MCP
 * server NEVER applies it — there is no apply/write/codemod tool (ADR-010).
 */
export interface SourceContextSuggestedDiff {
  readonly diff: string;
  readonly confidence: "high" | "medium" | "low";
  readonly preconditions: readonly string[];
  readonly kind?:
    | "tailwind-token-replace"
    | "css-declaration-replace"
    | "css-class-replace"
    | "css-modules-local-edit"
    | "inline-style-object-edit"
    | "jsx-text-edit"
    | "simple-reorder";
  readonly sourceRanges?: readonly {
    readonly startLine: number;
    readonly startColumn: number;
    readonly endLine: number;
    readonly endColumn: number;
  }[];
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
 * Verification plan / last result projection (ADR-020 C5 / ADR-019 C6).
 * Must never invent a stale `passed: true` when unpaired.
 * When a real content-owned result is projected: tabId, sessionId, ts, passed, details.
 */
export interface VerificationPlanSummary {
  readonly assertions: readonly { readonly description: string }[];
  readonly notes: string;
  /**
   * Optional pass/fail when a real verification result is projected.
   * Absent when unpaired / empty — never stale true.
   */
  readonly passed?: boolean;
  readonly tabId?: string;
  readonly sessionId?: string;
  readonly ts?: number;
  readonly details?: unknown;
}

/**
 * Injected dependencies for the MCP server tools (ADR-020 C5 nine tools).
 * Each method is async so the implementation can read from the projection
 * cache, storage, or a remote adapter.
 */
export interface McpServerDeps {
  getActiveSession(): Promise<SessionSummary>;
  getSelection(): Promise<SelectionSummary>;
  getChangeset(): Promise<ChangesetSummary>;
  getSourceContext(): Promise<unknown>;
  getVerificationPlan(): Promise<VerificationPlanSummary>;
  requestVerification(): Promise<CoordinationResult>;
  clearPreview(): Promise<CoordinationResult>;
  markPatchStarted(input: PatchStartedInput): Promise<CoordinationResult>;
  markPatchCompleted(input: PatchCompletedInput): Promise<CoordinationResult>;
}
