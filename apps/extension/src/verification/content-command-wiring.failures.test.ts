import { describe, expect, it } from "vitest";

import type { BusMessage } from "../messaging/types.js";
import type { OverlayRuntimeBus } from "../overlay/overlay-runtime.js";
import {
  BRIDGE_COMMAND_MESSAGE_TYPE,
  BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
  LOCAL_VERIFY_MESSAGE_TYPE,
  LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
  wireContentCommandHandlers,
} from "./content-command-wiring.js";

type SentMessage = {
  readonly route: Parameters<OverlayRuntimeBus["send"]>[0];
  readonly message: Parameters<OverlayRuntimeBus["send"]>[1];
};

function createBusHarness(): {
  readonly bus: OverlayRuntimeBus;
  readonly sent: SentMessage[];
  readonly dispatch: (message: BusMessage) => Promise<void>;
} {
  const handlers = new Map<string, Parameters<OverlayRuntimeBus["on"]>[1]>();
  const sent: SentMessage[] = [];
  return {
    bus: {
      send: (route, message) => {
        sent.push({ route, message });
      },
      on: (messageType, handler) => {
        handlers.set(messageType, handler);
        return () => {
          if (handlers.get(messageType) === handler) handlers.delete(messageType);
        };
      },
    },
    sent,
    dispatch: async (message) => {
      const handler = handlers.get(message.messageType);
      if (handler === undefined) throw new Error(`test setup: no ${message.messageType} handler`);
      await handler(message, { route: "background" });
    },
  };
}

function expectOnlySent(harness: ReturnType<typeof createBusHarness>): SentMessage {
  const message = harness.sent[0];
  if (message === undefined) throw new Error("expected one verification result");
  expect(harness.sent).toHaveLength(1);
  return message;
}

const stuckPreview = { activeCount: 1, clearAll: () => undefined };
const shallowRejectedOperation = { id: "op-rejected", kind: "remove-style" };

describe("wireContentCommandHandlers verification rejection", () => {
  it("emits a failed bridge result when shallow operation planning rejects", async () => {
    // Given
    const harness = createBusHarness();
    wireContentCommandHandlers({
      bus: harness.bus,
      preview: stuckPreview,
      now: () => 1700,
      skipHmrWait: true,
    });

    // When
    await harness.dispatch({
      protocolVersion: "1.0.0",
      messageId: "bridge-request",
      messageType: BRIDGE_COMMAND_MESSAGE_TYPE,
      tabId: 42,
      frameId: 0,
      sessionId: "sess-42",
      payload: {
        commandId: "cmd-rejected",
        kind: "request_verification",
        tabId: "42",
        operations: [shallowRejectedOperation],
      },
      timestamp: 1600,
    });

    // Then
    expect(expectOnlySent(harness)).toMatchObject({
      route: "background",
      message: {
        messageType: BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
        tabId: 42,
        frameId: 0,
        sessionId: "sess-42",
        payload: {
          commandId: "cmd-rejected",
          ok: false,
          kind: "request_verification",
          reason: "verification_rejected",
          passed: false,
          details: { verdict: "fail", assertions: [], previewCleared: false },
          ts: 1700,
        },
      },
    });
  });

  it("emits a failed local result when shallow operation planning rejects", async () => {
    // Given
    const harness = createBusHarness();
    wireContentCommandHandlers({
      bus: harness.bus,
      preview: stuckPreview,
      now: () => 1900,
      skipHmrWait: true,
    });

    // When
    await harness.dispatch({
      protocolVersion: "1.0.0",
      messageId: "local-request",
      messageType: LOCAL_VERIFY_MESSAGE_TYPE,
      tabId: 91,
      frameId: 2,
      sessionId: "sess-91",
      payload: { requestId: "local-request", operations: [shallowRejectedOperation] },
      timestamp: 1800,
    });

    // Then
    expect(expectOnlySent(harness)).toMatchObject({
      route: "background",
      message: {
        messageType: LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
        tabId: 91,
        frameId: 2,
        sessionId: "sess-91",
        payload: {
          requestId: "local-request",
          ok: false,
          reason: "verification_rejected",
          passed: false,
          details: { verdict: "fail", assertions: [], previewCleared: false },
          ts: 1900,
          tabId: 91,
        },
      },
    });
  });
});
