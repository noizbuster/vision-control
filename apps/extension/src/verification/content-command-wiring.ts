/**
 * Content-side handlers for MCP coordination commands and panel local verify.
 */

import type { Operation } from "@vision-control/change-ir";
import type { PreviewClearer } from "@vision-control/verification-engine";

import type { BusMessage } from "../messaging/types.js";
import type { OverlayRuntimeBus } from "../overlay/overlay-runtime.js";
import {
  type BridgeCommandPayload,
  dispatchCommandKind,
  parseBridgeCommandPayload,
} from "./bridge-command-kinds.js";
import {
  type ContentVerificationInput,
  type ContentVerificationOutcome,
  runContentVerification,
} from "./content-verification.js";

export const BRIDGE_COMMAND_MESSAGE_TYPE = "bridge-command";
export const BRIDGE_COMMAND_RESULT_MESSAGE_TYPE = "bridge-command-result";
export const LOCAL_VERIFY_MESSAGE_TYPE = "local-verify";
export const LOCAL_VERIFY_RESULT_MESSAGE_TYPE = "local-verify-result";

export interface ContentCommandWiring {
  readonly dispose: () => void;
}

export interface ContentCommandWiringOptions {
  readonly bus: OverlayRuntimeBus;
  readonly preview: PreviewClearer;
  readonly now?: () => number;
  readonly skipHmrWait?: boolean;
}

type ContentVerificationAttempt = {
  readonly ok: boolean;
  readonly outcome: ContentVerificationOutcome;
  readonly reason?: "verification_rejected";
};

async function runContentVerificationFailClosed(
  input: ContentVerificationInput,
): Promise<ContentVerificationAttempt> {
  return runContentVerification(input).then(
    (outcome) => ({ ok: true, outcome }),
    () => ({
      ok: false,
      reason: "verification_rejected",
      outcome: {
        passed: false,
        details: {
          verdict: "fail",
          assertions: [],
          retryContext: "Content verification rejected before producing a report.",
          previewCleared: input.preview.activeCount === 0,
        },
      },
    }),
  );
}

function isOperation(value: unknown): value is Operation {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof value.kind === "string" &&
    "id" in value &&
    typeof value.id === "string"
  );
}

function operationsFromPayload(raw: readonly unknown[] | undefined): Operation[] {
  if (raw === undefined) return [];
  return raw.filter(isOperation);
}

function parseLocalVerificationRequest(payload: unknown):
  | {
      readonly requestId: string;
      readonly operations: readonly unknown[];
    }
  | undefined {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("requestId" in payload) ||
    typeof payload.requestId !== "string" ||
    !("operations" in payload) ||
    !Array.isArray(payload.operations)
  ) {
    return undefined;
  }
  return { requestId: payload.requestId, operations: payload.operations };
}

export function wireContentCommandHandlers(
  options: ContentCommandWiringOptions,
): ContentCommandWiring {
  const now = options.now ?? Date.now;
  const skipHmrWait = options.skipHmrWait ?? false;
  const sendResult = (request: BusMessage, messageType: string, payload: unknown): void => {
    options.bus.send("background", {
      protocolVersion: "1.0.0",
      messageId: `${messageType}-${now()}`,
      messageType,
      ...(request.tabId !== undefined ? { tabId: request.tabId } : {}),
      ...(request.frameId !== undefined ? { frameId: request.frameId } : {}),
      ...(request.sessionId !== undefined ? { sessionId: request.sessionId } : {}),
      payload,
      timestamp: now(),
    });
  };

  const handleBridgeCommand = async (
    command: BridgeCommandPayload,
    request: BusMessage,
  ): Promise<void> => {
    const action = dispatchCommandKind(command);
    switch (action.kind) {
      case "clear_preview": {
        options.preview.clearAll();
        sendResult(request, BRIDGE_COMMAND_RESULT_MESSAGE_TYPE, {
          commandId: command.commandId,
          ok: options.preview.activeCount === 0,
          kind: "clear_preview",
          reason: options.preview.activeCount === 0 ? undefined : "preview_not_cleared",
        });
        return;
      }
      case "request_verification": {
        const result = await runContentVerificationFailClosed({
          operations: operationsFromPayload(action.operations),
          preview: options.preview,
          skipHmrWait,
        });
        sendResult(request, BRIDGE_COMMAND_RESULT_MESSAGE_TYPE, {
          commandId: command.commandId,
          ok: result.ok,
          kind: "request_verification",
          ...(result.reason !== undefined ? { reason: result.reason } : {}),
          passed: result.outcome.passed,
          details: result.outcome.details,
          ts: now(),
        });
        return;
      }
      case "mark_patch_started":
      case "mark_patch_completed": {
        sendResult(request, BRIDGE_COMMAND_RESULT_MESSAGE_TYPE, {
          commandId: command.commandId,
          ok: true,
          kind: action.kind,
          patchId: action.patchId,
        });
        return;
      }
      case "unsupported": {
        sendResult(request, BRIDGE_COMMAND_RESULT_MESSAGE_TYPE, {
          commandId: command.commandId,
          ok: false,
          kind: command.kind,
          reason: action.reason,
        });
        return;
      }
      default: {
        const _exhaustive: never = action;
        void _exhaustive;
      }
    }
  };

  const unsubBridge = options.bus.on(BRIDGE_COMMAND_MESSAGE_TYPE, (message) => {
    const command = parseBridgeCommandPayload(message.payload);
    if (command === undefined) return;
    return handleBridgeCommand(command, message);
  });

  const unsubLocal = options.bus.on(LOCAL_VERIFY_MESSAGE_TYPE, async (message) => {
    const request = parseLocalVerificationRequest(message.payload);
    if (request === undefined) return;
    const result = await runContentVerificationFailClosed({
      operations: operationsFromPayload(request.operations),
      preview: options.preview,
      skipHmrWait,
    });
    sendResult(message, LOCAL_VERIFY_RESULT_MESSAGE_TYPE, {
      requestId: request.requestId,
      ok: result.ok,
      ...(result.reason !== undefined ? { reason: result.reason } : {}),
      passed: result.outcome.passed,
      details: result.outcome.details,
      ts: now(),
      tabId: message.tabId,
    });
  });

  return {
    dispose: () => {
      unsubBridge();
      unsubLocal();
    },
  };
}
