/**
 * Background routes MCP command.enqueue → content, then projects results (C6).
 */

import type { BridgeClient } from "@vision-control/bridge-client";
import type { Operation } from "@vision-control/change-ir";
import type { Journal } from "@vision-control/change-journal";
import type { ProtocolEnvelope } from "@vision-control/protocol";
import { parseMessage } from "@vision-control/protocol";

import type { BusMessage, MessageContext } from "../messaging/types.js";
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
  readonly handleContentResult: (message: BusMessage, sender: MessageContext) => void;
  readonly requestLocalVerify: (tabId: number) => void;
  readonly dispose: () => void;
}

interface PendingResultContext {
  readonly tabId: number;
  readonly frameId: number;
  readonly sessionId: string | undefined;
}

interface PendingCommandContext extends PendingResultContext {
  readonly kind: string;
}

const TOP_FRAME_ID = 0;

function operationsFromJournal(journal: Journal): readonly Operation[] {
  return journal.entries
    .filter(
      (entry) =>
        (entry.status === "preview" || entry.status === "committed") &&
        entry.operation.runtime === false,
    )
    .map((entry) => entry.operation);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function matchesPendingContext(
  message: BusMessage,
  sender: MessageContext,
  pending: PendingResultContext,
): boolean {
  return (
    message.tabId === pending.tabId &&
    message.frameId === pending.frameId &&
    message.sessionId === pending.sessionId &&
    sender.route === "content" &&
    sender.tabId === pending.tabId &&
    sender.frameId === pending.frameId &&
    (sender.sessionId === undefined || sender.sessionId === pending.sessionId)
  );
}

export function createBackgroundCommandRouter(
  options: BackgroundCommandRouterOptions,
): BackgroundCommandRouter {
  const now = options.now ?? Date.now;
  const uuid = options.uuid ?? (() => globalThis.crypto.randomUUID());
  let unsubMessage: (() => void) | undefined;
  const pendingByCommand = new Map<string, PendingCommandContext>();
  const pendingLocalByRequest = new Map<string, PendingResultContext>();

  const forwardToContent = (
    tabId: number,
    commandId: string,
    kind: string,
    extra: Record<string, unknown>,
  ): void => {
    const journal = options.getJournal(tabId);
    const sessionId = options.getSessionId(tabId);
    pendingByCommand.set(commandId, { tabId, frameId: TOP_FRAME_ID, kind, sessionId });
    const message: BusMessage = {
      protocolVersion: "1.0.0",
      messageId: uuid(),
      messageType: BRIDGE_COMMAND_MESSAGE_TYPE,
      targetRoute: "content",
      tabId,
      frameId: TOP_FRAME_ID,
      ...(sessionId !== undefined ? { sessionId } : {}),
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

    const explicitTabId =
      cmd.tabId !== undefined && /^(?:0|[1-9]\d*)$/.test(cmd.tabId) ? Number(cmd.tabId) : undefined;
    if (
      cmd.tabId !== undefined &&
      (explicitTabId === undefined || !Number.isSafeInteger(explicitTabId))
    ) {
      client.ackCommand({
        commandId: cmd.commandId,
        ok: false,
        reason: "invalid_tab_id",
      });
      return;
    }
    const tabId = cmd.tabId === undefined ? options.getActiveTabId() : explicitTabId;
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
      pendingByCommand.clear();
      unsubMessage = client.onMessage(onEnvelope);
    },

    handleContentResult(message: BusMessage, sender: MessageContext): void {
      if (message.messageType === LOCAL_VERIFY_RESULT_MESSAGE_TYPE) {
        const payload = message.payload;
        if (!isRecord(payload) || typeof payload.requestId !== "string") return;
        const pending = pendingLocalByRequest.get(payload.requestId);
        if (pending === undefined) return;
        if (options.getSessionId(pending.tabId) !== pending.sessionId) {
          pendingLocalByRequest.delete(payload.requestId);
          return;
        }
        if (!matchesPendingContext(message, sender, pending)) return;
        pendingLocalByRequest.delete(payload.requestId);
        options.broadcastToPanel({
          ...message,
          targetRoute: "panel",
        });
        return;
      }
      if (message.messageType !== BRIDGE_COMMAND_RESULT_MESSAGE_TYPE) return;

      const payload = message.payload;
      if (!isRecord(payload)) return;
      if (typeof payload.commandId !== "string") return;

      const pending = pendingByCommand.get(payload.commandId);
      if (pending === undefined) return;
      if (options.getSessionId(pending.tabId) !== pending.sessionId) {
        pendingByCommand.delete(payload.commandId);
        return;
      }
      if (payload.kind !== pending.kind || !matchesPendingContext(message, sender, pending)) {
        return;
      }
      pendingByCommand.delete(payload.commandId);
      const client = options.getClient();
      if (client === undefined) return;

      const tabIdStr = String(pending.tabId);
      const ok = payload.ok === true;

      client.ackCommand({
        commandId: payload.commandId,
        ok,
        ...(typeof payload.reason === "string" ? { reason: payload.reason } : {}),
        tabId: tabIdStr,
      });

      if (pending.kind === "request_verification") {
        client.pushVerificationResult({
          tabId: tabIdStr,
          ts: typeof payload.ts === "number" ? payload.ts : now(),
          passed: payload.passed === true,
          details: payload.details ?? {},
          commandId: payload.commandId,
          ...(pending.sessionId !== undefined ? { sessionId: pending.sessionId } : {}),
        });
      }
    },

    requestLocalVerify(tabId: number): void {
      const journal = options.getJournal(tabId);
      const sessionId = options.getSessionId(tabId);
      const requestId = uuid();
      pendingLocalByRequest.set(requestId, {
        tabId,
        frameId: TOP_FRAME_ID,
        sessionId,
      });
      options.sendToTabContent(tabId, {
        protocolVersion: "1.0.0",
        messageId: requestId,
        messageType: LOCAL_VERIFY_MESSAGE_TYPE,
        targetRoute: "content",
        tabId,
        frameId: TOP_FRAME_ID,
        ...(sessionId !== undefined ? { sessionId } : {}),
        payload: { requestId, operations: operationsFromJournal(journal) },
        timestamp: now(),
      });
    },

    dispose: () => {
      unsubMessage?.();
      unsubMessage = undefined;
      pendingByCommand.clear();
      pendingLocalByRequest.clear();
    },
  };
}
