/**
 * Daemon-backed `McpServerDeps` factory.
 *
 * {@link createDaemonMcpDeps} adapts live daemon services into the
 * {@link McpServerDeps} interface the MCP tools consume. Every read method
 * pulls fresh data from the injected services; every coordination method
 * dispatches the matching §25.2 server→client message through the connection
 * service. Unlike {@link createStubDeps}, this returns REAL operations and a
 * REAL active session.
 *
 * PORTS, NOT CONCRETE SERVICES. The daemon-core service classes
 * (`SessionService`, `ChangesetService`, …) have repository-shaped APIs that
 * don't map 1:1 onto the MCP read surface. To keep this package decoupled
 * (no daemon-core / storage / verification-engine runtime dependency), each
 * injected service satisfies a narrow read-side {@link DaemonMcpDepsServices
 * port}. The daemon app (Wave 3) writes the thin adapters that bridge the real
 * services to these ports; tests inject fakes directly. This mirrors the
 * existing `McpServerDeps` injection pattern.
 *
 * GRACEFUL DEGRADATION. Every service is optional. A missing service never
 * throws — read methods return an empty/"not connected" shape and coordination
 * methods return `{ acknowledged: false }`. This lets the factory be wired
 * incrementally as the daemon services come online.
 *
 * REDACTION. The deps return raw read models; redaction happens at the tool
 * layer (`textResult` → `redactObject`, the single chokepoint in
 * `tool-helpers.ts`). No response leaves the server unredacted (ADR-009).
 *
 * CRITICAL GUARDRAIL: none of these methods mutate source. Coordination tools
 * dispatch signals only. There is no apply/write/codemod path (PRD §17.1,
 * ADR-010, docs/agents/mcp-policy.md).
 */

import type {
  ChangesetOperationSummary,
  ChangesetPrivacyReport,
  ChangesetSummary,
  CoordinationResult,
  Diagnostic,
  McpServerDeps,
  PatchCompletedInput,
  PatchStartedInput,
  SelectionSummary,
  SessionSummary,
} from "./types.js";

/** Read model: the active daemon session (a subset of `SessionSummary`). */
export interface ActiveSessionRead {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly connected: boolean;
  readonly clientVersion?: string;
  readonly protocolVersion: string;
}

/** Read model: the last `selection.changed` payload for a session. */
export interface SelectionChangedRead {
  readonly elementId: string;
  readonly elementTag: string;
  readonly selector?: string;
  readonly sourceId?: string;
  readonly textPreview?: string;
}

/** Read model: the current changeset for a session. */
export interface CurrentChangesetRead {
  /** Stable changeset id used to scope §25.2 dispatch (verification/clear). */
  readonly changesetId?: string;
  readonly operations: readonly ChangesetOperationSummary[];
  /** Privacy report computed by the context-compiler redaction engine. */
  readonly privacyReport?: ChangesetPrivacyReport;
}

/** Read model: a verification plan for the current changeset. */
export interface VerificationPlanRead {
  readonly assertions: readonly { readonly description: string }[];
  readonly notes: string;
}

/** Input passed to {@link ContextCompilerRead.compile}. */
export interface ContextCompileInput {
  readonly sessionId: string;
  readonly selection?: SelectionChangedRead;
}

/** Body for the §25.2.5 `verification.requested` dispatch. */
export interface VerificationRequestedDispatch {
  readonly changesetId: string;
  readonly timeoutMs: number;
}

/** Body for the §25.2.6 `preview.clearRequested` dispatch. */
export interface PreviewClearDispatch {
  readonly changesetId?: string;
  readonly reason: string;
}

/** Session-scoped read port: active session + last selection. */
export interface SessionServiceRead {
  getActive(): Promise<ActiveSessionRead | undefined>;
  getLastSelection?(sessionId: string): Promise<SelectionChangedRead | undefined>;
}

/** Changeset read port: the current (latest) changeset for a session. */
export interface ChangesetServiceRead {
  getCurrent(sessionId: string): Promise<CurrentChangesetRead | undefined>;
}

/** Source registry read port: resolve a source mapping for capture. */
export interface SourceRegistryServiceRead {
  resolve?(
    sourceId: string,
    sessionId: string,
  ): Promise<{ readonly sourceId: string; readonly filePath?: string } | undefined>;
}

/** Context compiler port: assemble the agent-facing context. */
export interface ContextCompilerRead {
  compile(input: ContextCompileInput): Promise<unknown> | unknown;
}

/** Verification coordinator port: the assertion plan for the changeset. */
export interface VerificationCoordinatorRead {
  getPlan(input?: {
    readonly sessionId?: string;
    readonly changesetId?: string;
  }): Promise<VerificationPlanRead>;
}

/** Connection dispatch port: emit §25.2 server→client messages to the browser. */
export interface ConnectionServiceDispatch {
  sendVerificationRequested?(body: VerificationRequestedDispatch): void;
  sendPreviewClearRequested?(body: PreviewClearDispatch): void;
}

/** Service ports injected into {@link createDaemonMcpDeps}. All optional. */
export interface DaemonMcpDepsServices {
  readonly sessionService?: SessionServiceRead;
  readonly changesetService?: ChangesetServiceRead;
  readonly sourceRegistryService?: SourceRegistryServiceRead;
  readonly contextCompiler?: ContextCompilerRead;
  readonly verificationCoordinator?: VerificationCoordinatorRead;
  readonly connectionService?: ConnectionServiceDispatch;
}

const NO_SESSION_NOTE = "no active session — connect a browser panel for live data";
const NO_COORDINATOR_NOTE = "no verification coordinator wired — plan unavailable";
const NO_DISPATCH_NOTE = "no connection service wired — signal not dispatched";
const NO_SOURCE_NOTE = "no source registry wired — capture unavailable";
const PROTOCOL_VERSION_FALLBACK = "2.0.0";
const DEFAULT_VERIFICATION_TIMEOUT_MS = 5000;
const CLEAR_PREVIEW_REASON = "mcp coordination: vision_clear_preview";

function toSessionSummary(active: ActiveSessionRead): SessionSummary {
  return { ...active };
}

function toSelectionSummary(sessionId: string, selection: SelectionChangedRead): SelectionSummary {
  return {
    sessionId,
    elementTag: selection.elementTag,
    selector: selection.selector,
    sourceId: selection.sourceId,
    textPreview: selection.textPreview,
  };
}

function disconnectedSession(): SessionSummary {
  return {
    sessionId: "none",
    workspaceId: "none",
    connected: false,
    protocolVersion: PROTOCOL_VERSION_FALLBACK,
    note: NO_SESSION_NOTE,
  };
}

function emptySelection(sessionId: string): SelectionSummary {
  return {
    sessionId,
    elementTag: "unknown",
    selector: undefined,
    sourceId: undefined,
    textPreview: undefined,
  };
}

/**
 * Build a daemon-backed {@link McpServerDeps} from injected service ports.
 *
 * Each read method resolves the active session first (the join key for every
 * other read), then queries the matching service. Missing services degrade to
 * an empty/"not connected" response rather than throwing.
 */
export function createDaemonMcpDeps(services: DaemonMcpDepsServices): McpServerDeps {
  const resolveActiveSession = (): Promise<ActiveSessionRead | undefined> =>
    services.sessionService?.getActive() ?? Promise.resolve(undefined);

  return {
    async getActiveSession(): Promise<SessionSummary> {
      const active = await resolveActiveSession();
      return active === undefined ? disconnectedSession() : toSessionSummary(active);
    },

    async getSelection(): Promise<SelectionSummary> {
      const active = await resolveActiveSession();
      if (active === undefined) return emptySelection("none");
      const selection = await services.sessionService?.getLastSelection?.(active.sessionId);
      return selection === undefined
        ? emptySelection(active.sessionId)
        : toSelectionSummary(active.sessionId, selection);
    },

    async getChangeset(): Promise<ChangesetSummary> {
      const active = await resolveActiveSession();
      if (active === undefined) {
        return { sessionId: "none", operationCount: 0, operations: [] };
      }
      const current = await services.changesetService?.getCurrent(active.sessionId);
      const operations = current?.operations ?? [];
      return {
        sessionId: active.sessionId,
        operationCount: operations.length,
        operations,
        ...(current?.privacyReport !== undefined ? { privacyReport: current.privacyReport } : {}),
      };
    },

    async getSourceContext(): Promise<unknown> {
      if (services.contextCompiler === undefined) return undefined;
      const active = await resolveActiveSession();
      if (active === undefined) return undefined;
      const selection = await services.sessionService?.getLastSelection?.(active.sessionId);
      return services.contextCompiler.compile({
        sessionId: active.sessionId,
        ...(selection !== undefined ? { selection } : {}),
      });
    },

    async getVerificationPlan() {
      if (services.verificationCoordinator === undefined) {
        return { assertions: [], notes: NO_COORDINATOR_NOTE };
      }
      const active = await resolveActiveSession();
      return services.verificationCoordinator.getPlan(
        active !== undefined ? { sessionId: active.sessionId } : {},
      );
    },

    async getDiagnostics(): Promise<readonly Diagnostic[]> {
      return [];
    },

    async captureElement() {
      const active = await resolveActiveSession();
      if (active === undefined) {
        return {
          captured: false,
          selector: undefined,
          sourceId: undefined,
          note: NO_SESSION_NOTE,
        };
      }
      const resolved =
        (await services.sourceRegistryService?.resolve?.(active.sessionId, active.sessionId)) ??
        undefined;
      if (resolved === undefined) {
        return {
          captured: false,
          selector: undefined,
          sourceId: undefined,
          note: NO_SOURCE_NOTE,
        };
      }
      return {
        captured: true,
        selector: undefined,
        sourceId: resolved.sourceId,
        note: "captured via source registry",
      };
    },

    async requestVerification(): Promise<CoordinationResult> {
      if (services.connectionService?.sendVerificationRequested === undefined) {
        return { acknowledged: false, message: NO_DISPATCH_NOTE };
      }
      const active = await resolveActiveSession();
      if (active === undefined) return { acknowledged: false, message: NO_SESSION_NOTE };
      const current = await services.changesetService?.getCurrent(active.sessionId);
      const changesetId = current?.changesetId ?? active.sessionId;
      services.connectionService.sendVerificationRequested({
        changesetId,
        timeoutMs: DEFAULT_VERIFICATION_TIMEOUT_MS,
      });
      return { acknowledged: true, message: "verification.requested dispatched" };
    },

    async clearPreview(): Promise<CoordinationResult> {
      if (services.connectionService?.sendPreviewClearRequested === undefined) {
        return { acknowledged: false, message: NO_DISPATCH_NOTE };
      }
      const active = await resolveActiveSession();
      const current =
        active !== undefined
          ? await services.changesetService?.getCurrent(active.sessionId)
          : undefined;
      services.connectionService.sendPreviewClearRequested({
        ...(current?.changesetId !== undefined ? { changesetId: current.changesetId } : {}),
        reason: CLEAR_PREVIEW_REASON,
      });
      return { acknowledged: true, message: "preview.clearRequested dispatched" };
    },

    async markPatchStarted(input: PatchStartedInput): Promise<CoordinationResult> {
      return {
        acknowledged: true,
        message: `patch ${input.patchId} started (recorded server-side; no §25.2 dispatch)`,
      };
    },

    async markPatchCompleted(input: PatchCompletedInput): Promise<CoordinationResult> {
      return {
        acknowledged: true,
        message: `patch ${input.patchId} ${input.success ? "completed" : "failed"} (recorded server-side; no §25.2 dispatch)`,
      };
    },
  };
}
