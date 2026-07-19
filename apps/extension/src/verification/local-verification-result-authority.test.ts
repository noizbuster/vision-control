import { createJournal } from "@vision-control/change-journal";
import { describe, expect, it } from "vitest";

import { type BusTransport, MessageBus } from "../messaging/bus.js";
import type { BusMessage, MessageContext } from "../messaging/types.js";
import { installBackgroundCommandResultHandlers } from "./background-command-result-wiring.js";
import { createBackgroundCommandRouter } from "./background-command-router.js";
import { LOCAL_VERIFY_RESULT_MESSAGE_TYPE } from "./content-command-wiring.js";

const TAB_ID = 7;
const FRAME_ID = 0;
const SESSION_ID = "sess-7";

function createLinkedResultBuses() {
  let receiveBackground: Parameters<BusTransport["subscribe"]>[0] | undefined;
  let sender: MessageContext = {
    route: "content",
    tabId: TAB_ID,
    frameId: FRAME_ID,
    sessionId: SESSION_ID,
  };
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

function requestIdFrom(message: BusMessage): string {
  const payload = message.payload;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("requestId" in payload) ||
    typeof payload.requestId !== "string"
  ) {
    throw new Error("Expected local verification request identity");
  }
  return payload.requestId;
}

interface LocalResultContext {
  readonly messageTabId: number;
  readonly messageFrameId: number;
  readonly messageSessionId: string;
  readonly senderRoute: MessageContext["route"];
  readonly senderTabId: number;
  readonly senderFrameId: number;
  readonly senderSessionId: string | undefined;
}

const VALID_CONTEXT: LocalResultContext = {
  messageTabId: TAB_ID,
  messageFrameId: FRAME_ID,
  messageSessionId: SESSION_ID,
  senderRoute: "content",
  senderTabId: TAB_ID,
  senderFrameId: FRAME_ID,
  senderSessionId: SESSION_ID,
};

function createLocalAuthorityHarness() {
  const broadcasts: BusMessage[] = [];
  const requests: BusMessage[] = [];
  let sessionId = SESSION_ID;
  const router = createBackgroundCommandRouter({
    getClient: () => undefined,
    getActiveTabId: () => TAB_ID,
    getJournal: () => createJournal(),
    getSessionId: () => sessionId,
    sendToTabContent: (_tabId, message) => requests.push(message),
    broadcastToPanel: (message) => broadcasts.push(message),
    now: () => 4000,
    uuid: () => "local-request-1",
  });
  const buses = createLinkedResultBuses();
  installBackgroundCommandResultHandlers(buses.backgroundBus, router);
  router.requestLocalVerify(TAB_ID);
  const request = requests[0];
  if (request === undefined) {
    throw new Error("Expected a local verification request");
  }
  const requestId = requestIdFrom(request);

  const sendResult = (overrides: Partial<LocalResultContext> = {}): void => {
    const context = { ...VALID_CONTEXT, ...overrides };
    buses.setSender({
      route: context.senderRoute,
      tabId: context.senderTabId,
      frameId: context.senderFrameId,
      ...(context.senderSessionId !== undefined ? { sessionId: context.senderSessionId } : {}),
    });
    buses.contentBus.send("background", {
      protocolVersion: "1.0.0",
      messageId: `local-result-${context.messageTabId}-${context.messageFrameId}`,
      messageType: LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
      tabId: context.messageTabId,
      frameId: context.messageFrameId,
      sessionId: context.messageSessionId,
      payload: { requestId, ok: true, passed: false },
      timestamp: 4001,
    });
  };

  return {
    broadcasts,
    request,
    sendResult,
    setSessionId: (value: string) => {
      sessionId = value;
    },
  };
}

const recoverableMismatches = [
  ["wrong message tab", { messageTabId: 99 }],
  ["wrong authenticated sender tab", { senderTabId: 99 }],
  ["wrong message frame", { messageFrameId: 2 }],
  ["wrong authenticated sender frame", { senderFrameId: 2 }],
  ["wrong message session", { messageSessionId: "sess-forged" }],
  ["wrong authenticated sender session", { senderSessionId: "sess-forged" }],
  ["non-content sender route", { senderRoute: "panel" }],
] satisfies readonly (readonly [string, Partial<LocalResultContext>])[];

describe("local verification result authority", () => {
  it("targets the authenticated top-frame tab session", () => {
    // Given
    const harness = createLocalAuthorityHarness();

    // When
    const request = harness.request;

    // Then
    expect(request).toMatchObject({
      messageType: "local-verify",
      tabId: TAB_ID,
      frameId: FRAME_ID,
      sessionId: SESSION_ID,
      payload: { requestId: "local-request-1" },
    });
  });

  it.each(
    recoverableMismatches,
  )("ignores %s and preserves the authentic pending request", (_name, mismatch) => {
    // Given
    const harness = createLocalAuthorityHarness();

    // When
    harness.sendResult(mismatch);
    harness.sendResult();

    // Then
    expect(harness.broadcasts).toHaveLength(1);
    expect(harness.broadcasts[0]).toMatchObject({
      targetRoute: "panel",
      tabId: TAB_ID,
      frameId: FRAME_ID,
      sessionId: SESSION_ID,
    });
  });

  it("cancels the pending request when the current tab session changes", () => {
    // Given
    const harness = createLocalAuthorityHarness();
    harness.setSessionId("sess-replaced");

    // When
    harness.sendResult();
    harness.setSessionId(SESSION_ID);
    harness.sendResult();

    // Then
    expect(harness.broadcasts).toEqual([]);
  });
});
