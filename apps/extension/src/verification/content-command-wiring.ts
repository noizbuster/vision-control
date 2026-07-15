/**
 * Content-side handlers for MCP coordination commands and panel local verify.
 */

import type { Operation } from "@vision-control/change-ir";
import type { PreviewClearer } from "@vision-control/verification-engine";

import type { OverlayRuntimeBus } from "../overlay/overlay-runtime.js";
import {
  type BridgeCommandPayload,
  dispatchCommandKind,
  parseBridgeCommandPayload,
} from "./bridge-command-kinds.js";
import { runContentVerification } from "./content-verification.js";

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

function isOperation(value: unknown): value is Operation {
  if (typeof value !== "object" || value === null) return false;
  const op = value as Record<string, unknown>;
  return typeof op.kind === "string" && typeof op.id === "string";
}

function operationsFromPayload(raw: readonly unknown[] | undefined): Operation[] {
  if (raw === undefined) return [];
  return raw.filter(isOperation);
}

function sendResult(
  bus: OverlayRuntimeBus,
  messageType: string,
  payload: unknown,
  now: () => number,
): void {
  bus.send("background", {
    protocolVersion: "1.0.0",
    messageId: `${messageType}-${now()}`,
    messageType,
    payload,
    timestamp: now(),
  });
}

export function wireContentCommandHandlers(
  options: ContentCommandWiringOptions,
): ContentCommandWiring {
  const now = options.now ?? Date.now;
  const skipHmrWait = options.skipHmrWait ?? true;

  const handleBridgeCommand = async (command: BridgeCommandPayload): Promise<void> => {
    const action = dispatchCommandKind(command);
    switch (action.kind) {
      case "clear_preview": {
        options.preview.clearAll();
        sendResult(
          options.bus,
          BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
          {
            commandId: command.commandId,
            ok: options.preview.activeCount === 0,
            kind: "clear_preview",
            reason: options.preview.activeCount === 0 ? undefined : "preview_not_cleared",
          },
          now,
        );
        return;
      }
      case "request_verification": {
        const outcome = await runContentVerification({
          operations: operationsFromPayload(action.operations),
          preview: options.preview,
          skipHmrWait,
        });
        sendResult(
          options.bus,
          BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
          {
            commandId: command.commandId,
            ok: true,
            kind: "request_verification",
            passed: outcome.passed,
            details: outcome.details,
            ts: now(),
          },
          now,
        );
        return;
      }
      case "mark_patch_started":
      case "mark_patch_completed": {
        sendResult(
          options.bus,
          BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
          {
            commandId: command.commandId,
            ok: true,
            kind: action.kind,
            patchId: action.patchId,
          },
          now,
        );
        return;
      }
      case "unsupported": {
        sendResult(
          options.bus,
          BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
          {
            commandId: command.commandId,
            ok: false,
            kind: "unsupported",
            reason: action.reason,
          },
          now,
        );
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
    void handleBridgeCommand(command);
  });

  const unsubLocal = options.bus.on(LOCAL_VERIFY_MESSAGE_TYPE, (message) => {
    const payload = message.payload as { readonly operations?: readonly unknown[] } | undefined;
    void runContentVerification({
      operations: operationsFromPayload(payload?.operations),
      preview: options.preview,
      skipHmrWait,
    }).then((outcome) => {
      sendResult(
        options.bus,
        LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
        {
          passed: outcome.passed,
          details: outcome.details,
          ts: now(),
          tabId: message.tabId,
        },
        now,
      );
    });
  });

  return {
    dispose: () => {
      unsubBridge();
      unsubLocal();
    },
  };
}
