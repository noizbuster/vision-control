/**
 * Background routes MCP command.enqueue → content, then projects results (C6).
 */

import type { BridgeClient } from "@vision-control/bridge-client";
import type { Journal } from "@vision-control/change-journal";
import type { ProtocolEnvelope } from "@vision-control/protocol";
import { parseMessage } from "@vision-control/protocol";

import type { BusMessage } from "../messaging/types.js";
import {
  BRIDGE_COMMAND_MESSAGE_TYPE,
  BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
  LOCAL_VERIFY_MESSAGE_TYPE,
  LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
} from "./content-command-wiring.js";

export interface BackgroundCommandRouterOptions {
  readonly getClient: () => BridgeClient | undefined;
  readonly getActiveTabId: () => number | undefined;
  readonly getJournal: (tabId: number) => Journal;
  readonly getSessionId: (tabId: number) => string | undefined;
  readonly sendToTabContent: (tabId: number, message: BusMessage) => void;
  readonly broadcastToPanel: (message: BusMessage) => void;
  readonly now?: () => number;
  readonly uuid?: () => string;
}

export interface BackgroundCommandRouter {
  readonly attachClient: (client: BridgeClient) => void;
  readonly handleContentResult: (message: BusMessage) => void;
  readonly requestLocalVerify: (tabId: number) => void;
  readonly dispose: () => void;
}

function operationsFromJournal(journal: Journal): readonly unknown[] {
  return journal.entries
    .filter((e) => e.status === "preview" || e.status === "committed")
    .map((e) => e.operation);
}

export function createBackgroundCommandRouter(
  options: BackgroundCommandRouterOptions,
): BackgroundCommandRouter {
  const now = options.now ?? Date.now;
  const uuid = options.uuid ?? (() => globalThis.crypto.randomUUID());
  let unsubMessage: (() => void) | undefined;
  const pendingByCommand = new Map<
    string,
    { readonly tabId: number; readonly kind: string; readonly sessionId: string | undefined }
  >();

  const forwardToContent = (
    tabId: number,
    commandId: string,
    kind: string,
    extra: Record<string, unknown>,
  ): void => {
    const journal = options.getJournal(tabId);
    const sessionId = options.getSessionId(tabId);
    pendingByCommand.set(commandId, { tabId, kind, sessionId });
    const message: BusMessage = {
      protocolVersion: "1.0.0",
      messageId: uuid(),
      messageType: BRIDGE_COMMAND_MESSAGE_TYPE,
      targetRoute: "content",
      tabId,
      payload: {
        commandId,
        kind,
        tabId: String(tabId),
        operations: kind === "request_verification" ? operationsFromJournal(journal) : undefined,
        ...extra,
      },
      timestamp: now(),
    };
    options.sendToTabContent(tabId, message);
  };

  const onEnvelope = (envelope: ProtocolEnvelope): void => {
    if (envelope.messageType !== "command.enqueue") return;
    const parsed = parseMessage(envelope.payload);
    if (!parsed.success || parsed.data.type !== "command.enqueue") return;
    const cmd = parsed.data;
    const client = options.getClient();
    if (client === undefined) return;

    const tabIdFromPayload =
      cmd.tabId !== undefined && /^\d+$/.test(cmd.tabId) ? Number(cmd.tabId) : undefined;
    const tabId = tabIdFromPayload ?? options.getActiveTabId();
    if (tabId === undefined) {
      client.ackCommand({
        commandId: cmd.commandId,
        ok: false,
        reason: "no_active_tab",
      });
      return;
    }

    forwardToContent(tabId, cmd.commandId, cmd.kind, {
      ...(cmd.patchId !== undefined ? { patchId: cmd.patchId } : {}),
      ...(cmd.description !== undefined ? { description: cmd.description } : {}),
      ...(cmd.success !== undefined ? { success: cmd.success } : {}),
      ...(cmd.changesetId !== undefined ? { changesetId: cmd.changesetId } : {}),
    });
  };

  return {
    attachClient(client: BridgeClient): void {
      unsubMessage?.();
      unsubMessage = client.onMessage(onEnvelope);
    },

    handleContentResult(message: BusMessage): void {
      if (message.messageType === LOCAL_VERIFY_RESULT_MESSAGE_TYPE) {
        options.broadcastToPanel({
          ...message,
          targetRoute: "panel",
        });
        return;
      }
      if (message.messageType !== BRIDGE_COMMAND_RESULT_MESSAGE_TYPE) return;

      const payload = message.payload as {
        readonly commandId?: string;
        readonly ok?: boolean;
        readonly kind?: string;
        readonly reason?: string;
        readonly passed?: boolean;
        readonly details?: unknown;
        readonly ts?: number;
      };
      if (typeof payload.commandId !== "string") return;

      const pending = pendingByCommand.get(payload.commandId);
      pendingByCommand.delete(payload.commandId);
      const client = options.getClient();
      if (client === undefined) return;

      const tabId = pending?.tabId ?? message.tabId;
      const tabIdStr = tabId !== undefined ? String(tabId) : undefined;
      const ok = payload.ok === true;

      client.ackCommand({
        commandId: payload.commandId,
        ok,
        ...(typeof payload.reason === "string" ? { reason: payload.reason } : {}),
        ...(tabIdStr !== undefined ? { tabId: tabIdStr } : {}),
      });

      if (payload.kind === "request_verification" && tabIdStr !== undefined) {
        client.pushVerificationResult({
          tabId: tabIdStr,
          ts: typeof payload.ts === "number" ? payload.ts : now(),
          passed: payload.passed === true,
          details: payload.details ?? {},
          commandId: payload.commandId,
          ...(pending?.sessionId !== undefined ? { sessionId: pending.sessionId } : {}),
        });
      }
    },

    requestLocalVerify(tabId: number): void {
      const journal = options.getJournal(tabId);
      options.sendToTabContent(tabId, {
        protocolVersion: "1.0.0",
        messageId: uuid(),
        messageType: LOCAL_VERIFY_MESSAGE_TYPE,
        targetRoute: "content",
        tabId,
        payload: { operations: operationsFromJournal(journal) },
        timestamp: now(),
      });
    },

    dispose: () => {
      unsubMessage?.();
      unsubMessage = undefined;
      pendingByCommand.clear();
    },
  };
}
