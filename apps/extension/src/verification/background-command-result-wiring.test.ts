import { BridgeClient } from "@vision-control/bridge-client";
import { createJournal } from "@vision-control/change-journal";
import { PROTOCOL_VERSION, type ProtocolEnvelope } from "@vision-control/protocol";
import { describe, expect, it, vi } from "vitest";

import { type BusTransport, MessageBus } from "../messaging/bus.js";
import type { BusMessage, MessageContext } from "../messaging/types.js";
import { installBackgroundCommandResultHandlers } from "./background-command-result-wiring.js";
import { createBackgroundCommandRouter } from "./background-command-router.js";
import {
  BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
  LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
} from "./content-command-wiring.js";

function createLinkedResultBuses() {
  let receiveBackground: Parameters<BusTransport["subscribe"]>[0] | undefined;
  let sender: MessageContext = { route: "content", tabId: 7, frameId: 0 };
  const backgroundBus = new MessageBus({
    route: "background",
    accept: () => true,
    transport: {
      route: "background",
      send: () => undefined,
      subscribe: (handler) => {
        receiveBackground = handler;
        return () => {
          receiveBackground = undefined;
        };
      },
    },
  });
  const contentBus = new MessageBus({
    route: "content",
    transport: {
      route: "content",
      send: (_target, message) => receiveBackground?.(message, sender),
      subscribe: () => () => undefined,
    },
  });
  return {
    backgroundBus,
    contentBus,
    setSender: (context: MessageContext) => {
      sender = context;
    },
  };
}

function createClientProbe() {
  const client = new BridgeClient();
  let receiveCommand: ((envelope: ProtocolEnvelope) => void) | undefined;
  vi.spyOn(client, "onMessage").mockImplementation((handler) => {
    receiveCommand = handler;
    return () => undefined;
  });
  const ack = vi.spyOn(client, "ackCommand").mockImplementation(() => undefined);
  const project = vi.spyOn(client, "pushVerificationResult").mockImplementation(() => undefined);
  return {
    client,
    ack,
    project,
    receiveCommand: (envelope: ProtocolEnvelope) => receiveCommand?.(envelope),
  };
}

type ResultKind = "clear_preview" | "request_verification";

interface ResultContext {
  readonly messageTabId: number;
  readonly messageFrameId: number;
  readonly messageSessionId: string;
  readonly senderTabId: number;
  readonly senderFrameId: number;
  readonly kind: ResultKind;
  readonly passed: boolean;
}

const VALID_RESULT_CONTEXT: ResultContext = {
  messageTabId: 7,
  messageFrameId: 0,
  messageSessionId: "sess-7",
  senderTabId: 7,
  senderFrameId: 0,
  kind: "request_verification",
  passed: false,
};

function createRouteHarness() {
  const client = createClientProbe();
  let sessionId = "sess-7";
  const router = createBackgroundCommandRouter({
    getClient: () => client.client,
    getActiveTabId: () => 7,
    getJournal: () => createJournal(),
    getSessionId: () => sessionId,
    sendToTabContent: () => undefined,
    broadcastToPanel: () => undefined,
    now: () => 3000,
    uuid: () => "route-message",
  });
  router.attachClient(client.client);
  client.receiveCommand({
    protocolVersion: PROTOCOL_VERSION,
    messageId: "pending-command",
    messageType: "command.enqueue",
    timestamp: 3000,
    payload: {
      type: "command.enqueue",
      commandId: "cmd-context",
      kind: "request_verification",
      tabId: "7",
    },
  });
  const buses = createLinkedResultBuses();
  installBackgroundCommandResultHandlers(buses.backgroundBus, router);
  const sendResult = (overrides: Partial<ResultContext> = {}): void => {
    const context = { ...VALID_RESULT_CONTEXT, ...overrides };
    buses.setSender({
      route: "content",
      tabId: context.senderTabId,
      frameId: context.senderFrameId,
    });
    buses.contentBus.send("background", {
      protocolVersion: "1.0.0",
      messageId: `result-${context.kind}-${context.senderTabId}-${context.senderFrameId}`,
      messageType: BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
      tabId: context.messageTabId,
      frameId: context.messageFrameId,
      sessionId: context.messageSessionId,
      payload: {
        commandId: "cmd-context",
        kind: context.kind,
        ok: true,
        passed: context.passed,
      },
      timestamp: 3001,
    });
  };
  return {
    client,
    sendResult,
    setSessionId: (value: string) => {
      sessionId = value;
    },
  };
}

const recoverableMismatches = [
  [
    "wrong message tab and kind",
    { messageTabId: 999, senderTabId: 999, kind: "clear_preview", passed: true },
  ],
  ["wrong authenticated sender tab", { senderTabId: 999, passed: true }],
  ["wrong authenticated sender frame", { senderFrameId: 4, passed: true }],
  ["wrong message frame", { messageFrameId: 4, passed: true }],
  ["wrong result kind", { kind: "clear_preview", passed: true }],
  ["wrong echoed session", { messageSessionId: "sess-forged", passed: true }],
] satisfies readonly (readonly [string, Partial<ResultContext>])[];

describe("background command result route", () => {
  it.each(
    recoverableMismatches,
  )("ignores %s and preserves the pending command", (_name, mismatch) => {
    // Given
    const harness = createRouteHarness();

    // When
    harness.sendResult(mismatch);
    harness.sendResult();
    // Then
    expect(harness.client.ack).toHaveBeenCalledTimes(1);
    expect(harness.client.project.mock.calls.map(([value]) => value.passed)).toEqual([false]);
  });

  it("cancels the pending command when the current tab session changes", () => {
    // Given
    const harness = createRouteHarness();
    harness.setSessionId("sess-replaced");

    // When
    harness.sendResult();
    harness.setSessionId("sess-7");
    harness.sendResult();

    // Then
    expect(harness.client.ack).not.toHaveBeenCalled();
    expect(harness.client.project).not.toHaveBeenCalled();
  });

  it("preserves local verification result broadcast with local pending state", () => {
    // Given
    const broadcast = vi.fn();
    const requests: BusMessage[] = [];
    const router = createBackgroundCommandRouter({
      getClient: () => undefined,
      getActiveTabId: () => 7,
      getJournal: () => createJournal(),
      getSessionId: () => "sess-7",
      sendToTabContent: (_tabId, message) => requests.push(message),
      broadcastToPanel: broadcast,
      uuid: () => "local-request",
    });
    const buses = createLinkedResultBuses();
    installBackgroundCommandResultHandlers(buses.backgroundBus, router);
    router.requestLocalVerify(7);
    const request = requests[0];
    if (
      request === undefined ||
      typeof request.payload !== "object" ||
      request.payload === null ||
      !("requestId" in request.payload) ||
      typeof request.payload.requestId !== "string"
    ) {
      throw new Error("Expected local verification request identity");
    }

    // When
    buses.contentBus.send("background", {
      protocolVersion: "1.0.0",
      messageId: "local-result",
      messageType: LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
      tabId: 7,
      frameId: 0,
      sessionId: "sess-7",
      payload: { requestId: request.payload.requestId, ok: true, passed: true },
      timestamp: 3000,
    });

    // Then
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
        targetRoute: "panel",
        payload: expect.objectContaining({ ok: true, passed: true }),
      }),
    );
  });
});
