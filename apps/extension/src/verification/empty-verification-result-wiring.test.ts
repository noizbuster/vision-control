import { BridgeClient } from "@vision-control/bridge-client";
import {
  appendEntry,
  createJournal,
  createJournalEntry,
  type Journal,
} from "@vision-control/change-journal";
import { PROTOCOL_VERSION, type ProtocolEnvelope } from "@vision-control/protocol";
import { describe, expect, it, vi } from "vitest";

import { type BusTransport, MessageBus } from "../messaging/bus.js";
import type { BusMessage, MessageContext } from "../messaging/types.js";
import { installBackgroundCommandResultHandlers } from "./background-command-result-wiring.js";
import { createBackgroundCommandRouter } from "./background-command-router.js";
import {
  BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
  LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
  wireContentCommandHandlers,
} from "./content-command-wiring.js";

const TAB_ID = 7;
const FRAME_ID = 0;
const SESSION_ID = "sess-7";

const backgroundContext: MessageContext = { route: "background" };
const contentContext: MessageContext = {
  route: "content",
  tabId: TAB_ID,
  frameId: FRAME_ID,
  sessionId: SESSION_ID,
};

function createLinkedBuses(): {
  readonly backgroundBus: MessageBus;
  readonly contentBus: MessageBus;
  readonly resultSent: Promise<BusMessage>;
} {
  let receiveBackground: Parameters<BusTransport["subscribe"]>[0] | undefined;
  let receiveContent: Parameters<BusTransport["subscribe"]>[0] | undefined;
  let resolveResult: ((message: BusMessage) => void) | undefined;
  const resultSent = new Promise<BusMessage>((resolve) => {
    resolveResult = resolve;
  });
  const backgroundBus = new MessageBus({
    route: "background",
    accept: () => true,
    transport: {
      route: "background",
      send: (_target, message) => receiveContent?.(message, backgroundContext),
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
      send: (_target, message) => {
        receiveBackground?.(message, contentContext);
        if (
          message.messageType === BRIDGE_COMMAND_RESULT_MESSAGE_TYPE ||
          message.messageType === LOCAL_VERIFY_RESULT_MESSAGE_TYPE
        ) {
          resolveResult?.(message);
        }
      },
      subscribe: (handler) => {
        receiveContent = handler;
        return () => {
          receiveContent = undefined;
        };
      },
    },
  });
  return { backgroundBus, contentBus, resultSent };
}

function createClientProbe(): {
  readonly client: BridgeClient;
  readonly ack: ReturnType<typeof vi.fn>;
  readonly project: ReturnType<typeof vi.fn>;
  readonly emitVerification: () => void;
} {
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
    emitVerification: () =>
      receiveCommand?.({
        protocolVersion: PROTOCOL_VERSION,
        messageId: "verification-envelope",
        messageType: "command.enqueue",
        timestamp: 2000,
        payload: {
          type: "command.enqueue",
          commandId: "cmd-empty-verification",
          kind: "request_verification",
          tabId: String(TAB_ID),
        },
      }),
  };
}

function createRouteHarness(journal: Journal = createJournal()) {
  const buses = createLinkedBuses();
  const client = createClientProbe();
  const broadcast = vi.fn();
  const preview = {
    activeCount: 2,
    clearAll(): void {
      this.activeCount = 0;
    },
  };
  const router = createBackgroundCommandRouter({
    getClient: () => client.client,
    getActiveTabId: () => TAB_ID,
    getJournal: () => journal,
    getSessionId: () => SESSION_ID,
    sendToTabContent: (_tabId, message) => buses.backgroundBus.send("content", message),
    broadcastToPanel: broadcast,
    now: () => 2000,
    uuid: () => "verification-message",
  });
  installBackgroundCommandResultHandlers(buses.backgroundBus, router);
  wireContentCommandHandlers({
    bus: buses.contentBus,
    preview,
    now: () => 2000,
    skipHmrWait: true,
  });
  router.attachClient(client.client);
  return { buses, client, router, broadcast, preview };
}

function journalWithStyleOperation(runtime: boolean): Journal {
  const entry = createJournalEntry({
    id: "je-empty-verification",
    changeSetId: "cs-empty-verification",
    transactionId: "tx-empty-verification",
    sequence: 0,
    operation: {
      id: "op-empty-verification",
      kind: "style-edit",
      runtime,
      origin: "property-panel",
      confidence: 1,
      timestamp: 0,
      target: { runtimeId: "missing-target", selector: "#missing-target" },
      property: "color",
      value: "red",
      important: false,
    },
    actor: "human",
    status: "committed",
  });
  return appendEntry(createJournal(), entry);
}

describe("empty verification result wiring", () => {
  it("projects empty bridge verification as non-success after clearing preview", async () => {
    // Given
    const harness = createRouteHarness();

    // When
    harness.client.emitVerification();
    await harness.buses.resultSent;

    // Then
    expect(harness.preview.activeCount).toBe(0);
    expect(harness.client.ack).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: "cmd-empty-verification", ok: true }),
    );
    expect(harness.client.project).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        details: expect.objectContaining({ verdict: "fail", previewCleared: true }),
      }),
    );
  });

  it("broadcasts empty local verification as non-success after clearing preview", async () => {
    // Given
    const harness = createRouteHarness();

    // When
    harness.router.requestLocalVerify(TAB_ID);
    await harness.buses.resultSent;

    // Then
    expect(harness.preview.activeCount).toBe(0);
    expect(harness.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
        payload: expect.objectContaining({
          ok: true,
          passed: false,
          details: expect.objectContaining({ verdict: "fail", previewCleared: true }),
        }),
      }),
    );
  });

  it("projects runtime-only bridge verification as missing source intent", async () => {
    // Given
    const harness = createRouteHarness(journalWithStyleOperation(true));

    // When
    harness.client.emitVerification();
    await harness.buses.resultSent;

    // Then
    expect(harness.client.project).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        details: expect.objectContaining({
          verdict: "fail",
          assertions: expect.arrayContaining([
            expect.objectContaining({ name: "source-intent-present", passed: false }),
          ]),
        }),
      }),
    );
  });

  it("broadcasts runtime-only local verification as missing source intent", async () => {
    // Given
    const harness = createRouteHarness(journalWithStyleOperation(true));

    // When
    harness.router.requestLocalVerify(TAB_ID);
    await harness.buses.resultSent;

    // Then
    expect(harness.broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        messageType: LOCAL_VERIFY_RESULT_MESSAGE_TYPE,
        payload: expect.objectContaining({
          passed: false,
          details: expect.objectContaining({
            verdict: "fail",
            assertions: expect.arrayContaining([
              expect.objectContaining({ name: "source-intent-present", passed: false }),
            ]),
          }),
        }),
      }),
    );
  });

  it("projects a content-owned non-empty verification failure as false", async () => {
    // Given
    const harness = createRouteHarness(journalWithStyleOperation(false));

    // When
    harness.client.emitVerification();
    await harness.buses.resultSent;

    // Then
    expect(harness.client.project).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        details: expect.objectContaining({ verdict: "fail", previewCleared: true }),
      }),
    );
  });
});
