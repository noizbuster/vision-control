import { appendEntry, createJournal, createJournalEntry } from "@vision-control/change-journal";
import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { describe, expect, it, vi } from "vitest";

import { createBackgroundCommandRouter } from "./background-command-router.js";
import {
  BRIDGE_COMMAND_MESSAGE_TYPE,
  BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
  LOCAL_VERIFY_MESSAGE_TYPE,
} from "./content-command-wiring.js";

function makeStyleOp(id = "op-style-00001") {
  return {
    id,
    kind: "style-edit" as const,
    runtime: false,
    origin: "property-panel" as const,
    confidence: 1,
    timestamp: 0,
    target: { runtimeId: "rt-1", sourceId: "src-1", selector: "#el" },
    property: "color",
    value: "red",
    important: false,
  };
}

function journalWithStyleOp() {
  const entry = createJournalEntry({
    id: "je-entry-0001",
    changeSetId: "csjournal001",
    transactionId: "tx-journal-001",
    sequence: 0,
    operation: makeStyleOp(),
    actor: "human",
    status: "committed",
  });
  return appendEntry(createJournal(), entry);
}

describe("createBackgroundCommandRouter", () => {
  it("forwards command.enqueue to content with journal operations", () => {
    const sent: unknown[] = [];
    const journal = journalWithStyleOp();

    const ack = vi.fn();
    const pushVerificationResult = vi.fn();
    let envelopeHandler: ((env: unknown) => void) | undefined;
    const client = {
      onMessage: (handler: (env: unknown) => void) => {
        envelopeHandler = handler;
        return () => undefined;
      },
      ackCommand: ack,
      pushVerificationResult,
    };

    const router = createBackgroundCommandRouter({
      getClient: () => client as never,
      getActiveTabId: () => 42,
      getJournal: () => journal,
      getSessionId: () => "sess-42",
      sendToTabContent: (_tabId, message) => {
        sent.push(message);
      },
      broadcastToPanel: () => undefined,
      now: () => 1000,
      uuid: () => "uuid-1",
    });

    router.attachClient(client as never);
    envelopeHandler?.({
      protocolVersion: PROTOCOL_VERSION,
      messageId: "env-1",
      messageType: "command.enqueue",
      timestamp: 1000,
      payload: {
        type: "command.enqueue",
        commandId: "cmd-verify-1",
        kind: "request_verification",
        tabId: "42",
      },
    });

    expect(sent).toHaveLength(1);
    const msg = sent[0] as {
      messageType: string;
      tabId: number;
      payload: { commandId: string; kind: string; operations: unknown[] };
    };
    expect(msg.messageType).toBe(BRIDGE_COMMAND_MESSAGE_TYPE);
    expect(msg.tabId).toBe(42);
    expect(msg.payload.kind).toBe("request_verification");
    expect(msg.payload.operations).toHaveLength(1);

    router.handleContentResult({
      protocolVersion: "1.0.0",
      messageId: "r1",
      messageType: BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
      tabId: 42,
      payload: {
        commandId: "cmd-verify-1",
        ok: true,
        kind: "request_verification",
        passed: true,
        details: { verdict: "pass", assertions: [], previewCleared: true },
        ts: 2000,
      },
      timestamp: 2000,
    });

    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: "cmd-verify-1", ok: true, tabId: "42" }),
    );
    expect(pushVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: "42",
        sessionId: "sess-42",
        passed: true,
        ts: 2000,
        commandId: "cmd-verify-1",
      }),
    );
  });

  it("acks no_active_tab when no tab is available", () => {
    const ack = vi.fn();
    let envelopeHandler: ((env: unknown) => void) | undefined;
    const client = {
      onMessage: (handler: (env: unknown) => void) => {
        envelopeHandler = handler;
        return () => undefined;
      },
      ackCommand: ack,
      pushVerificationResult: vi.fn(),
    };
    const router = createBackgroundCommandRouter({
      getClient: () => client as never,
      getActiveTabId: () => undefined,
      getJournal: () => createJournal(),
      getSessionId: () => undefined,
      sendToTabContent: () => undefined,
      broadcastToPanel: () => undefined,
    });
    router.attachClient(client as never);
    envelopeHandler?.({
      protocolVersion: PROTOCOL_VERSION,
      messageId: "env-2",
      messageType: "command.enqueue",
      timestamp: 1,
      payload: {
        type: "command.enqueue",
        commandId: "cmd-x",
        kind: "clear_preview",
      },
    });
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: "cmd-x", ok: false, reason: "no_active_tab" }),
    );
  });

  it("requestLocalVerify sends local-verify with operations", () => {
    const sent: unknown[] = [];
    const journal = journalWithStyleOp();
    const router = createBackgroundCommandRouter({
      getClient: () => undefined,
      getActiveTabId: () => 9,
      getJournal: () => journal,
      getSessionId: () => undefined,
      sendToTabContent: (_t, m) => {
        sent.push(m);
      },
      broadcastToPanel: () => undefined,
      uuid: () => "u2",
      now: () => 5,
    });
    router.requestLocalVerify(9);
    expect(sent[0]).toMatchObject({
      messageType: LOCAL_VERIFY_MESSAGE_TYPE,
      tabId: 9,
    });
    const payload = (sent[0] as { payload: { operations: unknown[] } }).payload;
    expect(payload.operations).toHaveLength(1);
  });
});
