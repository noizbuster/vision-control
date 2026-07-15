/**
 * McpServerDeps backed by the projection cache (ADR-020 C5).
 *
 * Unpaired / heartbeat-stale → explicit not_paired / empty.
 * Never invents selection. Never returns stale verification pass.
 */

import type { VisionContextSnapshot } from "@vision-control/context-compiler";
import type { BridgeCommandKind, PROTOCOL_VERSION } from "@vision-control/protocol";

import type {
  ChangesetSummary,
  CoordinationResult,
  McpServerDeps,
  PatchCompletedInput,
  PatchStartedInput,
  SelectionSummary,
  SessionSummary,
  VerificationPlanSummary,
} from "../types.js";
import type { CommandQueue } from "./command-queue.js";
import type { ProjectionCache } from "./projection-cache.js";

const NOT_PAIRED = "not_paired";
const PROTOCOL = "2.0.0" satisfies typeof PROTOCOL_VERSION | string;

export interface ProjectionCommandPayload {
  readonly commandId: string;
  readonly kind: BridgeCommandKind;
  readonly tabId?: string;
  readonly patchId?: string;
  readonly description?: string;
  readonly success?: boolean;
  readonly changesetId?: string;
}

export interface ProjectionDepsOptions {
  readonly cache: ProjectionCache;
  readonly commands: CommandQueue;
  readonly now?: () => number;
  /** Deliver command.enqueue to the paired extension socket. */
  readonly sendCommand?: (command: ProjectionCommandPayload) => boolean;
}

export function createProjectionDeps(options: ProjectionDepsOptions): McpServerDeps {
  const { cache, commands } = options;
  const now = options.now ?? Date.now;

  const requireLive = ():
    | { live: true; entry: NonNullable<ReturnType<ProjectionCache["getActive"]>> }
    | { live: false } => {
    if (!cache.isLive(now())) {
      return { live: false };
    }
    const entry = cache.getActive();
    if (entry === undefined) {
      return { live: false };
    }
    return { live: true, entry };
  };

  const enqueue = (
    kind: "clear_preview" | "request_verification" | "mark_patch_started" | "mark_patch_completed",
    extra?: {
      readonly patchId?: string;
      readonly description?: string;
      readonly success?: boolean;
      readonly changesetId?: string;
    },
  ): CoordinationResult => {
    if (!cache.isLive(now())) {
      return { acknowledged: false, message: NOT_PAIRED };
    }
    const active = cache.getActive();
    const command = commands.enqueue(
      {
        kind,
        tabId: active?.tabId,
        patchId: extra?.patchId,
        description: extra?.description,
        success: extra?.success,
        changesetId: extra?.changesetId,
      },
      now(),
    );
    const delivered =
      options.sendCommand?.({
        commandId: command.commandId,
        kind: command.kind,
        tabId: command.tabId,
        patchId: command.patchId,
        description: command.description,
        success: command.success,
        changesetId: command.changesetId,
      }) ?? false;
    if (!delivered) {
      commands.ack(command.commandId, false, "no_socket");
      return { acknowledged: false, message: NOT_PAIRED };
    }
    return { acknowledged: true, message: `enqueued:${command.commandId}` };
  };

  return {
    async getActiveSession(): Promise<SessionSummary> {
      if (!cache.isLive(now())) {
        return {
          sessionId: "none",
          workspaceId: "none",
          connected: false,
          protocolVersion: PROTOCOL,
          note: NOT_PAIRED,
        };
      }
      const entry = cache.getActive();
      return {
        sessionId: entry?.sessionId ?? entry?.tabId ?? "paired",
        workspaceId: "extension",
        connected: true,
        protocolVersion: PROTOCOL,
      };
    },

    async getSelection(): Promise<SelectionSummary> {
      const gate = requireLive();
      if (!gate.live) {
        return emptySelection();
      }
      return selectionFromSnapshot(gate.entry.snapshot, gate.entry.sessionId ?? gate.entry.tabId);
    },

    async getChangeset(): Promise<ChangesetSummary> {
      const gate = requireLive();
      if (!gate.live) {
        return { sessionId: "none", operationCount: 0, operations: [] };
      }
      const snap = gate.entry.snapshot;
      return {
        sessionId: gate.entry.sessionId ?? gate.entry.tabId,
        operationCount: snap.operations.length,
        operations: snap.operations.map((op) => ({
          id: op.id,
          kind: op.kind,
          runtime: op.runtime,
          description: op.description,
        })),
      };
    },

    async getSourceContext(): Promise<unknown> {
      const gate = requireLive();
      if (!gate.live) return undefined;
      return gate.entry.snapshot;
    },

    async getVerificationPlan(): Promise<VerificationPlanSummary> {
      // Unpaired / stale: empty plan, never invent passed:true (ADR-019 C6).
      if (!cache.isLive(now())) {
        return { assertions: [], notes: NOT_PAIRED };
      }
      const result = cache.getVerificationResult();
      if (result === undefined) {
        return { assertions: [], notes: "no verification result projected yet" };
      }
      return {
        assertions: assertionsFromDetails(result.details),
        notes: result.passed ? "content verification passed" : "content verification failed",
        passed: result.passed,
        tabId: result.tabId,
        sessionId: result.sessionId,
        ts: result.ts,
        details: result.details,
      };
    },

    async requestVerification(): Promise<CoordinationResult> {
      return enqueue("request_verification");
    },

    async clearPreview(): Promise<CoordinationResult> {
      return enqueue("clear_preview");
    },

    async markPatchStarted(input: PatchStartedInput): Promise<CoordinationResult> {
      return enqueue("mark_patch_started", {
        patchId: input.patchId,
        description: input.description,
      });
    },

    async markPatchCompleted(input: PatchCompletedInput): Promise<CoordinationResult> {
      return enqueue("mark_patch_completed", {
        patchId: input.patchId,
        success: input.success,
      });
    },
  };
}

function emptySelection(): SelectionSummary {
  return {
    sessionId: "none",
    elementTag: "unknown",
    selector: undefined,
    sourceId: undefined,
    textPreview: undefined,
  };
}

function assertionsFromDetails(details: unknown): readonly { readonly description: string }[] {
  if (typeof details !== "object" || details === null) {
    return [];
  }
  const assertions = (details as { assertions?: unknown }).assertions;
  if (!Array.isArray(assertions)) {
    return [];
  }
  const out: { description: string }[] = [];
  for (const entry of assertions) {
    if (typeof entry !== "object" || entry === null) continue;
    const name = (entry as { name?: unknown; description?: unknown }).name;
    const description = (entry as { description?: unknown }).description;
    if (typeof name === "string") {
      out.push({ description: name });
    } else if (typeof description === "string") {
      out.push({ description });
    }
  }
  return out;
}

function selectionFromSnapshot(
  snapshot: VisionContextSnapshot,
  sessionId: string,
): SelectionSummary {
  const selection = snapshot.selection;
  if (selection === undefined) {
    return emptySelection();
  }
  const firstSelector = selection.identity.selectors[0];
  return {
    sessionId,
    elementTag: selection.semantic.tagName,
    selector: firstSelector,
    sourceId: selection.identity.sourceId,
    textPreview: selection.semantic.textContentPreview,
  };
}
