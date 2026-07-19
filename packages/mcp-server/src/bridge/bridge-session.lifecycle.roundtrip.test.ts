import { PROTOCOL_VERSION } from "@vision-control/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import {
  type BridgeServerHandle,
  createBridgeSession,
  createCommandQueue,
  createProjectionCache,
  createProjectionDeps,
  minimalSnapshot,
  mintPairToken,
  startBridgeServer,
} from "./index.js";

describe("bridge session lifecycle round-trip", () => {
  let handle: BridgeServerHandle | undefined;
  let client: WebSocket | undefined;

  afterEach(async () => {
    client?.close();
    client = undefined;
    if (handle !== undefined) {
      await handle.stop();
      handle = undefined;
    }
  });

  it("preserves exact early focus across wrong snapshot and close wire order", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue();
    const clock = 1_000;
    const session = createBridgeSession({ cache, commands, now: () => clock });
    const pairToken = mintPairToken({ now: () => 0 });
    handle = await startBridgeServer({
      port: 0,
      pairToken,
      now: () => 0,
      onPaired: (socket) => session.attach(socket),
    });
    const socket = await new Promise<WebSocket>((resolve, reject) => {
      const candidate = new WebSocket(
        `ws://127.0.0.1:${handle?.port}/bridge?token=${encodeURIComponent(pairToken.token)}`,
      );
      candidate.on("open", () => resolve(candidate));
      candidate.on("error", reject);
    });
    client = socket;
    let messageIndex = 0;
    const send = (messageType: string, tabId: string, payload: unknown): void => {
      messageIndex += 1;
      socket.send(
        JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          messageId: `ordered-${messageIndex}`,
          messageType,
          tabId,
          timestamp: clock,
          payload,
        }),
      );
    };
    const sendSnapshot = (tabId: string, sessionId: string, selectionTag: string): void => {
      const snapshotRev = 1;
      send("snapshot.push", tabId, {
        type: "snapshot.push",
        tabId,
        sessionId,
        snapshotRev,
        snapshot: minimalSnapshot({ tabId, sessionId, snapshotRev, selectionTag }),
      });
    };
    const sendLifecycle = (
      type: "projection.tab.closed" | "projection.tab.focused",
      tabId: string,
      sessionId: string,
    ): void => send(type, tabId, { type, tabId, sessionId });
    const deps = createProjectionDeps({ cache, commands, now: () => clock });
    sendSnapshot("tab-a", "session-a", "nav");
    await vi.waitFor(() => expect(cache.getActive()?.tabId).toBe("tab-a"));
    sendLifecycle("projection.tab.focused", "tab-a", "session-a");

    sendLifecycle("projection.tab.focused", "tab-b", "session-b");
    sendSnapshot("tab-b", "session-wrong", "aside");
    await vi.waitFor(() => expect(cache.getByTab("tab-b")?.sessionId).toBe("session-wrong"));
    sendLifecycle("projection.tab.closed", "tab-b", "session-wrong");
    await vi.waitFor(() => expect(cache.getByTab("tab-b")).toBeUndefined());
    const hiddenSession = await deps.getActiveSession();
    sendSnapshot("tab-b", "session-b", "article");

    expect(hiddenSession.sessionId).not.toBe("session-a");
    await vi.waitFor(() =>
      expect(cache.getActive()).toMatchObject({ tabId: "tab-b", sessionId: "session-b" }),
    );
    expect(await deps.getSelection()).toMatchObject({
      elementTag: "article",
      sessionId: "session-b",
    });
    socket.close();
  });

  it("rejects sessionless snapshot resurrection after identified close wire order", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue();
    const clock = 1_000;
    const session = createBridgeSession({ cache, commands, now: () => clock });
    const pairToken = mintPairToken({ now: () => 0 });
    handle = await startBridgeServer({
      port: 0,
      pairToken,
      now: () => 0,
      onPaired: (socket) => session.attach(socket),
    });
    const socket = await new Promise<WebSocket>((resolve, reject) => {
      const candidate = new WebSocket(
        `ws://127.0.0.1:${handle?.port}/bridge?token=${encodeURIComponent(pairToken.token)}`,
      );
      candidate.on("open", () => resolve(candidate));
      candidate.on("error", reject);
    });
    client = socket;
    let messageIndex = 0;
    const send = (messageType: string, tabId: string, payload: unknown): void => {
      messageIndex += 1;
      socket.send(
        JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          messageId: `retired-${messageIndex}`,
          messageType,
          tabId,
          timestamp: clock,
          payload,
        }),
      );
    };
    const identified = minimalSnapshot({
      tabId: "tab-closed",
      sessionId: "session-closed",
      snapshotRev: 1,
    });
    send("snapshot.push", "tab-closed", {
      type: "snapshot.push",
      tabId: "tab-closed",
      sessionId: "session-closed",
      snapshotRev: 1,
      snapshot: identified,
    });
    await vi.waitFor(() => expect(cache.getByTab("tab-closed")).toBeDefined());
    send("projection.tab.focused", "tab-closed", {
      type: "projection.tab.focused",
      tabId: "tab-closed",
      sessionId: "session-closed",
    });
    send("projection.tab.closed", "tab-closed", {
      type: "projection.tab.closed",
      tabId: "tab-closed",
      sessionId: "session-closed",
    });
    await vi.waitFor(() => expect(cache.getByTab("tab-closed")).toBeUndefined());

    send("snapshot.push", "tab-closed", {
      type: "snapshot.push",
      tabId: "tab-closed",
      snapshotRev: 2,
      snapshot: minimalSnapshot({ tabId: "tab-closed", snapshotRev: 2 }),
    });
    send("snapshot.push", "tab-barrier", {
      type: "snapshot.push",
      tabId: "tab-barrier",
      sessionId: "session-barrier",
      snapshotRev: 1,
      snapshot: minimalSnapshot({
        tabId: "tab-barrier",
        sessionId: "session-barrier",
        snapshotRev: 1,
      }),
    });
    await vi.waitFor(() => expect(cache.getByTab("tab-barrier")).toBeDefined());

    expect(cache.getByTab("tab-closed")).toBeUndefined();
    socket.close();
  });
});
