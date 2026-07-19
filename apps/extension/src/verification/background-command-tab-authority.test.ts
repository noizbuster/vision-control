import { BridgeClient } from "@vision-control/bridge-client";
import { createJournal } from "@vision-control/change-journal";
import { PROTOCOL_VERSION, type ProtocolEnvelope } from "@vision-control/protocol";
import { describe, expect, it, vi } from "vitest";

import type { BusMessage } from "../messaging/types.js";
import { createBackgroundCommandRouter } from "./background-command-router.js";

function createTabAuthorityProbe() {
  const client = new BridgeClient();
  const sent: BusMessage[] = [];
  const getActiveTabId = vi.fn(() => 42);
  const ack = vi.spyOn(client, "ackCommand").mockImplementation(() => undefined);
  let receive: ((envelope: ProtocolEnvelope) => void) | undefined;
  vi.spyOn(client, "onMessage").mockImplementation((handler) => {
    receive = handler;
    return () => undefined;
  });
  const router = createBackgroundCommandRouter({
    getClient: () => client,
    getActiveTabId,
    getJournal: () => createJournal(),
    getSessionId: () => "sess-42",
    sendToTabContent: (_tabId, message) => sent.push(message),
    broadcastToPanel: () => undefined,
    now: () => 3000,
    uuid: () => "uuid-tab-authority",
  });
  router.attachClient(client);
  const emit = (commandId: string, tabId?: string): void => {
    receive?.({
      protocolVersion: PROTOCOL_VERSION,
      messageId: `env-${commandId}`,
      messageType: "command.enqueue",
      timestamp: 3000,
      payload: {
        type: "command.enqueue",
        commandId,
        kind: "clear_preview",
        ...(tabId === undefined ? {} : { tabId }),
      },
    });
  };
  return { ack, emit, getActiveTabId, sent };
}

describe("background command tab authority", () => {
  it("uses the active tab when command.enqueue omits tabId", () => {
    const probe = createTabAuthorityProbe();
    probe.emit("cmd-omitted-tab");
    expect(probe.getActiveTabId).toHaveBeenCalledOnce();
    expect(probe.sent).toEqual([
      expect.objectContaining({ tabId: 42, payload: expect.objectContaining({ tabId: "42" }) }),
    ]);
    expect(probe.ack).not.toHaveBeenCalled();
  });

  it("uses a canonical explicit tab without consulting active-tab state", () => {
    const probe = createTabAuthorityProbe();
    probe.emit("cmd-explicit-tab", "42");
    expect(probe.getActiveTabId).not.toHaveBeenCalled();
    expect(probe.sent).toEqual([expect.objectContaining({ tabId: 42 })]);
    expect(probe.ack).not.toHaveBeenCalled();
  });

  it.each([
    "tab-42",
    "042",
    "42.0",
    " 42",
    "+42",
    "9007199254740992",
  ])("rejects malformed explicit tabId %s without active-tab fallback", (tabId) => {
    const probe = createTabAuthorityProbe();
    probe.emit("cmd-invalid-tab", tabId);
    expect(probe.getActiveTabId).not.toHaveBeenCalled();
    expect(probe.sent).toEqual([]);
    expect(probe.ack).toHaveBeenCalledWith({
      commandId: "cmd-invalid-tab",
      ok: false,
      reason: "invalid_tab_id",
    });
  });
});
