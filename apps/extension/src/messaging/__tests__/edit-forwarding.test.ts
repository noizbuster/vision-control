/**
 * Background edit-forwarding logic: proves an "editor-command" / "clear-preview"
 * message from the panel is resolved to the inspected tab's routeable content
 * frame and forwarded with targetRoute:"content" so the content bus accepts it.
 *
 * The forwarder is extracted from background.ts so the routing decision is
 * unit-testable without chrome APIs; the entrypoint only wires the real
 * chrome.tabs.sendMessage into it.
 */

import { describe, expect, it } from "vitest";

import { createEditForwarder } from "../edit-forwarding.js";
import { TabSessionStore } from "../tab-session.js";
import type { BusMessage } from "../types.js";

function makeMessage(messageType: string, overrides: Partial<BusMessage>): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `mid-${messageType}`,
    messageType,
    targetRoute: "background",
    payload: {},
    timestamp: 1,
    ...overrides,
  };
}

function frame(frameId: number, origin: string, routeable: boolean) {
  return {
    frameId,
    url: `${origin}/`,
    origin,
    routeable,
  };
}

describe("createEditForwarder", () => {
  it("forwards an editor-command to the inspected tab's routeable top frame", () => {
    const store = new TabSessionStore({ generateSessionId: () => "sess-fwd-1" });
    store.ensure(7);
    store.updateFrameTree(7, [frame(0, "http://localhost:3000", true)]);
    const sent: Array<{ tabId: number; frameId: number; message: BusMessage }> = [];
    const forward = createEditForwarder({
      store,
      sendToFrame: async (tabId, frameId, message) => {
        sent.push({ tabId, frameId, message });
      },
    });

    const op = { kind: "style-edit", id: "op-fwd-001" } as unknown;
    const message = makeMessage("editor-command", {
      tabId: 7,
      payload: op,
    });

    forward(message);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.tabId).toBe(7);
    expect(sent[0]?.frameId).toBe(0);
    expect(sent[0]?.message.messageType).toBe("editor-command");
    expect(sent[0]?.message.targetRoute).toBe("content");
    expect(sent[0]?.message.tabId).toBe(7);
    expect(sent[0]?.message.frameId).toBe(0);
  });

  it("forwards a clear-preview message to the routeable frame", () => {
    const store = new TabSessionStore({ generateSessionId: () => "sess-fwd-2" });
    store.ensure(9);
    store.updateFrameTree(9, [frame(0, "http://127.0.0.1:5173", true)]);
    const sent: Array<{ tabId: number; frameId: number; message: BusMessage }> = [];
    const forward = createEditForwarder({
      store,
      sendToFrame: async (t, f, m) => sent.push({ tabId: t, frameId: f, message: m }),
    });

    forward(makeMessage("clear-preview", { tabId: 9 }));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.message.messageType).toBe("clear-preview");
    expect(sent[0]?.message.targetRoute).toBe("content");
  });

  it("drops the message when no tabId is present", () => {
    const store = new TabSessionStore({ generateSessionId: () => "sess-fwd-3" });
    store.ensure(1);
    store.updateFrameTree(1, [frame(0, "http://localhost:3000", true)]);
    const sent: BusMessage[] = [];
    const forward = createEditForwarder({ store, sendToFrame: async (_t, _f, m) => sent.push(m) });

    forward(makeMessage("editor-command", {}));
    expect(sent).toHaveLength(0);
  });

  it("drops the message when the tab has no session (content not loaded)", () => {
    const store = new TabSessionStore({ generateSessionId: () => "sess-fwd-4" });
    const sent: BusMessage[] = [];
    const forward = createEditForwarder({ store, sendToFrame: async (_t, _f, m) => sent.push(m) });

    forward(makeMessage("editor-command", { tabId: 404 }));
    expect(sent).toHaveLength(0);
  });

  it("drops the message when the inspected tab has no routeable frame", () => {
    const store = new TabSessionStore({ generateSessionId: () => "sess-fwd-5" });
    store.ensure(3);
    store.updateFrameTree(3, [frame(0, "http://localhost:3000", false)]);
    const sent: BusMessage[] = [];
    const forward = createEditForwarder({ store, sendToFrame: async (_t, _f, m) => sent.push(m) });

    forward(makeMessage("editor-command", { tabId: 3 }));
    expect(sent).toHaveLength(0);
  });

  it("falls back to the first routeable frame when frameId 0 is absent", () => {
    const store = new TabSessionStore({ generateSessionId: () => "sess-fwd-6" });
    store.ensure(5);
    store.updateFrameTree(5, [
      frame(1, "http://localhost:3000", true),
      frame(2, "http://localhost:3000", true),
    ]);
    const sent: Array<{ tabId: number; frameId: number }> = [];
    const forward = createEditForwarder({
      store,
      sendToFrame: async (tabId, frameId) => sent.push({ tabId, frameId }),
    });

    forward(makeMessage("editor-command", { tabId: 5 }));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.frameId).toBe(1);
  });
});
