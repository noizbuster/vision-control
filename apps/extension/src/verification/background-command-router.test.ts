import { BridgeClient } from "@vision-control/bridge-client";
import { appendEntry, createJournal, createJournalEntry } from "@vision-control/change-journal";
import { PROTOCOL_VERSION, type ProtocolEnvelope } from "@vision-control/protocol";
import { describe, expect, it, vi } from "vitest";

import type { BusMessage } from "../messaging/types.js";
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

type TestCommandKind = "clear_preview" | "request_verification";
const CONTENT_SENDER = { route: "content", tabId: 42, frameId: 0 } as const;

function makeClientProbe() {
  const client = new BridgeClient();
  let envelopeHandler: ((envelope: ProtocolEnvelope) => void) | undefined;
  vi.spyOn(client, "onMessage").mockImplementation((handler) => {
    envelopeHandler = handler;
    return () => undefined;
  });
  const ack = vi.spyOn(client, "ackCommand").mockImplementation(() => undefined);
  const pushVerificationResult = vi
    .spyOn(client, "pushVerificationResult")
    .mockImplementation(() => undefined);
  const emitCommand = (
    commandId: string,
    kind: TestCommandKind = "request_verification",
    tabId: string | null = "42",
  ): void => {
    envelopeHandler?.({
      protocolVersion: PROTOCOL_VERSION,
      messageId: `env-${commandId}`,
      messageType: "command.enqueue",
      timestamp: 3000,
      payload: {
        type: "command.enqueue",
        commandId,
        kind,
        ...(tabId !== null ? { tabId } : {}),
      },
    });
  };
  return { client, ack, pushVerificationResult, emitCommand };
}

interface RouterProbeOptions {
  readonly getClient?: () => BridgeClient | undefined;
  readonly getActiveTabId?: () => number | undefined;
  readonly getSessionId?: (tabId: number) => string | undefined;
}

function makeRouterProbe(options: RouterProbeOptions = {}) {
  const sent: BusMessage[] = [];
  const router = createBackgroundCommandRouter({
    getClient: options.getClient ?? (() => undefined),
    getActiveTabId: options.getActiveTabId ?? (() => 42),
    getJournal: () => journalWithStyleOp(),
    getSessionId: options.getSessionId ?? (() => "sess-42"),
    sendToTabContent: (_tabId, message) => sent.push(message),
    broadcastToPanel: () => undefined,
    now: () => 3000,
    uuid: () => "uuid-1",
  });
  return { router, sent };
}

function makeVerificationResult(commandId: string, ok: boolean, passed: boolean): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `result-${commandId}`,
    messageType: BRIDGE_COMMAND_RESULT_MESSAGE_TYPE,
    tabId: 42,
    frameId: 0,
    sessionId: "sess-42",
    payload: {
      commandId,
      ok,
      kind: "request_verification",
      reason: ok ? undefined : "verification_rejected",
      passed,
      details: {
        verdict: passed ? "pass" : "fail",
        assertions: [],
        previewCleared: passed,
      },
      ts: 3000,
    },
    timestamp: 3000,
  };
}

describe("createBackgroundCommandRouter", () => {
  it("forwards command.enqueue to content with journal operations", () => {
    const client = makeClientProbe();
    const { router, sent } = makeRouterProbe({ getClient: () => client.client });
    router.attachClient(client.client);
    client.emitCommand("cmd-verify-1");
    expect(sent[0]).toMatchObject({
      messageType: BRIDGE_COMMAND_MESSAGE_TYPE,
      tabId: 42,
      frameId: 0,
      sessionId: "sess-42",
      payload: { commandId: "cmd-verify-1", kind: "request_verification", operations: [{}] },
    });
    router.handleContentResult(makeVerificationResult("cmd-verify-1", true, true), CONTENT_SENDER);
    expect(client.ack).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: "cmd-verify-1", ok: true, tabId: "42" }),
    );
    expect(client.pushVerificationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: "42",
        sessionId: "sess-42",
        passed: true,
        ts: 3000,
        commandId: "cmd-verify-1",
      }),
    );
  });

  it("acks no_active_tab when no tab is available", () => {
    const client = makeClientProbe();
    const { router } = makeRouterProbe({
      getClient: () => client.client,
      getActiveTabId: () => undefined,
    });
    router.attachClient(client.client);
    client.emitCommand("cmd-x", "clear_preview", null);
    expect(client.ack).toHaveBeenCalledWith(
      expect.objectContaining({ commandId: "cmd-x", ok: false, reason: "no_active_tab" }),
    );
  });

  it("projects false when a later verification request rejects", () => {
    // Given
    const client = makeClientProbe();
    const { router } = makeRouterProbe({ getClient: () => client.client });
    router.attachClient(client.client);
    // When
    client.emitCommand("cmd-pass");
    router.handleContentResult(makeVerificationResult("cmd-pass", true, true), CONTENT_SENDER);
    client.emitCommand("cmd-rejected");
    router.handleContentResult(
      makeVerificationResult("cmd-rejected", false, false),
      CONTENT_SENDER,
    );
    // Then
    expect(client.pushVerificationResult.mock.calls.map(([value]) => value.passed)).toEqual([
      true,
      false,
    ]);
    expect(client.pushVerificationResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tabId: "42",
        sessionId: "sess-42",
        passed: false,
        commandId: "cmd-rejected",
      }),
    );
    expect(client.ack).toHaveBeenLastCalledWith(
      expect.objectContaining({
        commandId: "cmd-rejected",
        ok: false,
        reason: "verification_rejected",
      }),
    );
  });

  it("ignores an unknown result instead of projecting caller-supplied success", () => {
    // Given
    const client = makeClientProbe();
    const { router } = makeRouterProbe({ getClient: () => client.client });
    router.attachClient(client.client);
    client.emitCommand("cmd-current");
    router.handleContentResult(makeVerificationResult("cmd-current", false, false), CONTENT_SENDER);
    // When
    router.handleContentResult(makeVerificationResult("cmd-forged", true, true), CONTENT_SENDER);
    // Then
    expect(client.ack).toHaveBeenCalledTimes(1);
    expect(client.pushVerificationResult.mock.calls.map(([value]) => value.passed)).toEqual([
      false,
    ]);
  });

  it("ignores a duplicate result after consuming the pending command", () => {
    // Given
    const client = makeClientProbe();
    const { router } = makeRouterProbe({ getClient: () => client.client });
    router.attachClient(client.client);
    client.emitCommand("cmd-once");
    router.handleContentResult(makeVerificationResult("cmd-once", false, false), CONTENT_SENDER);
    // When
    router.handleContentResult(makeVerificationResult("cmd-once", true, true), CONTENT_SENDER);
    // Then
    expect(client.ack).toHaveBeenCalledTimes(1);
    expect(client.pushVerificationResult.mock.calls.map(([value]) => value.passed)).toEqual([
      false,
    ]);
  });

  it("ignores a late result after replacing the bridge client", () => {
    // Given
    const first = makeClientProbe();
    const replacement = makeClientProbe();
    let currentClient = first.client;
    const { router } = makeRouterProbe({ getClient: () => currentClient });
    router.attachClient(first.client);
    first.emitCommand("cmd-old");
    currentClient = replacement.client;
    router.attachClient(replacement.client);
    replacement.emitCommand("cmd-current");
    router.handleContentResult(makeVerificationResult("cmd-current", false, false), CONTENT_SENDER);
    // When
    router.handleContentResult(makeVerificationResult("cmd-old", true, true), CONTENT_SENDER);
    // Then
    expect(first.ack).not.toHaveBeenCalled();
    expect(replacement.ack).toHaveBeenCalledTimes(1);
    expect(replacement.pushVerificationResult.mock.calls.map(([value]) => value.passed)).toEqual([
      false,
    ]);
  });

  it("requestLocalVerify sends local-verify with operations", () => {
    const { router, sent } = makeRouterProbe();
    router.requestLocalVerify(9);
    expect(sent[0]).toMatchObject({
      messageType: LOCAL_VERIFY_MESSAGE_TYPE,
      tabId: 9,
      payload: { operations: [{}] },
    });
  });
});
