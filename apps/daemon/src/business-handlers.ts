/**
 * Wave 3 (Task 16) wiring of the §25.1 browser→daemon handler slots to the real
 * daemon services. Replaces the Wave 1 default no-ops: every business message
 * now drives a real service action (persist / resolve / record) plus an
 * append-only audit row, so none is ack-and-discard.
 *
 * Also builds the server→client {@link ConnectionServiceDispatch} port that MCP
 * coordination tools (`vision_request_verification`, `vision_clear_preview`)
 * drive to emit §25.2 messages on the active session's socket. That port was
 * absent before this task, so coordination signals silently degraded to "not
 * dispatched"; now they reach the browser.
 */

import type {
  BrowserToDaemonHandler,
  ChangesetService,
  ConnectionService,
} from "@vision-control/daemon-core";
import { buildEnvelope, serializeEnvelope } from "@vision-control/daemon-core";
import type { Logger } from "@vision-control/logger";
import type { ConnectionServiceDispatch, SelectionChangedRead } from "@vision-control/mcp-server";
import type {
  ChangesetUpdated,
  DiagnosticReported,
  PageNavigated,
  SelectionChanged,
  SourceRequest,
  VerificationRuntimeResult,
} from "@vision-control/protocol";
import {
  type AuditEventOutcome,
  type AuditEventType,
  createAuditEvent,
} from "@vision-control/security";
import type { AuditRepository } from "@vision-control/storage";
import type { SourcePipeline } from "./source-pipeline.js";
import { resolveSourceRequest } from "./source-pipeline.js";

/**
 * In-memory last-selection read model, keyed by sessionId. The §25.1.4
 * `selection.changed` payload carries only `elementId` + `framePath` (no tag,
 * selector, or text), so the stored {@link SelectionChangedRead} honestly
 * reports `elementTag: "unknown"` — the browser owns the richer inspector view;
 * the daemon persists the opaque id the MCP `getSelection` / context-compiler
 * ports join against.
 */
export interface SelectionStore {
  get(sessionId: string): SelectionChangedRead | undefined;
  set(sessionId: string, selection: SelectionChangedRead): void;
  clear(sessionId: string): void;
}

export function createSelectionStore(): SelectionStore {
  const store = new Map<string, SelectionChangedRead>();
  return {
    get: (id) => store.get(id),
    set: (id, selection) => {
      store.set(id, selection);
    },
    clear: (id) => {
      store.delete(id);
    },
  };
}

export interface BusinessHandlerDeps {
  readonly workspaceId: string;
  readonly getActiveSessionId: () => string | undefined;
  readonly auditRepo: AuditRepository;
  readonly logger: Logger;
  readonly changesetService: ChangesetService;
  readonly sourcePipeline: SourcePipeline;
  readonly selectionStore: SelectionStore;
  readonly now?: () => number;
  readonly uuid?: () => string;
}

export interface BusinessHandlers {
  readonly onPageNavigated: BrowserToDaemonHandler<PageNavigated>;
  readonly onSelectionChanged: BrowserToDaemonHandler<SelectionChanged>;
  readonly onChangesetUpdated: BrowserToDaemonHandler<ChangesetUpdated>;
  readonly onSourceRequest: BrowserToDaemonHandler<SourceRequest>;
  readonly onVerificationRuntimeResult: BrowserToDaemonHandler<VerificationRuntimeResult>;
  readonly onDiagnosticReported: BrowserToDaemonHandler<DiagnosticReported>;
}

const DIAG_SEVERITY_TO_LOG: Readonly<
  Record<DiagnosticReported["severity"], "error" | "warn" | "info">
> = {
  error: "error",
  warning: "warn",
  info: "info",
};

export function createBusinessHandlers(deps: BusinessHandlerDeps): BusinessHandlers {
  const now = deps.now ?? Date.now;
  const uuid = deps.uuid ?? globalThis.crypto.randomUUID.bind(globalThis.crypto);

  const audit = (params: {
    readonly type: AuditEventType;
    readonly action: string;
    readonly target?: string;
    readonly outcome?: AuditEventOutcome;
    readonly metadata?: Record<string, unknown>;
  }): void => {
    deps.auditRepo.insert({
      id: uuid(),
      workspace_id: deps.workspaceId,
      event: createAuditEvent({
        type: params.type,
        action: params.action,
        actor: "daemon",
        outcome: params.outcome ?? "success",
        ...(params.target !== undefined ? { target: params.target } : {}),
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      }),
      created_at: now(),
    });
  };

  return {
    onPageNavigated(payload) {
      deps.logger.info("Page navigated", {
        url: payload.url,
        title: payload.title,
        frameDepth: payload.framePath.length,
      });
      audit({
        type: "session",
        action: "page-navigated",
        metadata: { url: payload.url, title: payload.title },
      });
    },

    onSelectionChanged(payload) {
      const sessionId = deps.getActiveSessionId();
      if (sessionId !== undefined) {
        deps.selectionStore.set(sessionId, {
          elementId: payload.elementId,
          elementTag: "unknown",
        });
      }
      deps.logger.debug("Selection changed", { elementId: payload.elementId });
      audit({ type: "session", action: "selection-changed", target: payload.elementId });
    },

    onChangesetUpdated(payload) {
      const sessionId = deps.getActiveSessionId();
      if (sessionId === undefined) {
        deps.logger.warn("changeset.updated before session ready; skipping persist");
        return;
      }
      deps.changesetService.persist({
        sessionId,
        workspaceId: deps.workspaceId,
        operations: payload.operations,
      });
      audit({
        type: "changeset",
        action: "changeset-updated",
        target: payload.changesetId,
        metadata: { revision: payload.revision, operationCount: payload.operations.length },
      });
    },

    onSourceRequest(payload, sender) {
      const resolved = resolveSourceRequest(
        deps.sourcePipeline.resolver,
        deps.sourcePipeline.registry,
        payload.elementId,
      );
      sender.sendSourceResolved({
        requestId: payload.requestId,
        elementId: payload.elementId,
        sourceToken: resolved.sourceToken,
        confidence: resolved.confidence,
      });
      audit({
        type: "source",
        action: "source-resolved",
        target: payload.elementId,
        metadata: { requestId: payload.requestId, confidence: resolved.confidence },
      });
    },

    onVerificationRuntimeResult(payload) {
      const logLevel = payload.passed ? "info" : "warn";
      deps.logger[logLevel]("Verification runtime result", {
        changesetId: payload.changesetId,
        passed: payload.passed,
      });
      audit({
        type: "verification",
        action: "runtime-result",
        target: payload.changesetId,
        outcome: payload.passed ? "success" : "failure",
        metadata: { passed: payload.passed },
      });
    },

    onDiagnosticReported(payload) {
      deps.logger[DIAG_SEVERITY_TO_LOG[payload.severity]]("Diagnostic reported", {
        severity: payload.severity,
        message: payload.message,
        elementId: payload.elementId,
      });
      audit({
        type: "session",
        action: "diagnostic-reported",
        ...(payload.elementId !== undefined ? { target: payload.elementId } : {}),
        metadata: { severity: payload.severity, message: payload.message },
      });
    },
  };
}

export interface ConnectionDispatchDeps {
  readonly connectionService: ConnectionService;
  readonly getActiveSessionId: () => string | undefined;
  readonly now?: () => number;
  readonly uuid?: () => string;
}

/**
 * Build the {@link ConnectionServiceDispatch} port the MCP coordination tools
 * drive. Each method addresses the active session's socket via
 * {@link ConnectionService.sendToSession} so server-initiated §25.2 frames
 * (verification.requested, preview.clearRequested) reach the browser without a
 * correlated inbound message.
 */
export function createConnectionDispatch(deps: ConnectionDispatchDeps): ConnectionServiceDispatch {
  const now = deps.now ?? Date.now;
  const uuid = deps.uuid ?? globalThis.crypto.randomUUID.bind(globalThis.crypto);
  const emit = (messageType: string, body: Record<string, unknown>): void => {
    const sessionId = deps.getActiveSessionId();
    if (sessionId === undefined) return;
    const envelope = buildEnvelope(messageType, { type: messageType, ...body }, { now, uuid });
    deps.connectionService.sendToSession(sessionId, serializeEnvelope(envelope));
  };
  return {
    sendVerificationRequested(body) {
      emit("verification.requested", { ...body });
    },
    sendPreviewClearRequested(body) {
      emit("preview.clearRequested", { ...body });
    },
  };
}
