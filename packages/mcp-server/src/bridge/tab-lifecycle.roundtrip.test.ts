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

type SnapshotInput = {
  readonly tabId: string;
  readonly sessionId: string;
  readonly snapshotRev: number;
  readonly selectionTag: string;
};

describe("bridge tab lifecycle round-trip", () => {
  let handle: BridgeServerHandle | undefined;
  let socket: WebSocket | undefined;

  afterEach(async () => {
    socket?.close();
    socket = undefined;
    if (handle !== undefined) {
      await handle.stop();
      handle = undefined;
    }
  });

  const startHarness = async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue();
    const now = 1_000;
    const session = createBridgeSession({ cache, commands, now: () => now });
    const pairToken = mintPairToken({ now: () => 0 });
    handle = await startBridgeServer({
      port: 0,
      pairToken,
      now: () => 0,
      onPaired: (pairedSocket) => session.attach(pairedSocket),
    });
    socket = await new Promise<WebSocket>((resolve, reject) => {
      const candidate = new WebSocket(
        `ws://127.0.0.1:${handle?.port}/bridge?token=${encodeURIComponent(pairToken.token)}`,
      );
      candidate.on("open", () => resolve(candidate));
      candidate.on("error", reject);
    });
    return {
      cache,
      deps: createProjectionDeps({ cache, commands, now: () => now }),
    };
  };

  const sendSnapshot = (input: SnapshotInput): void => {
    const snapshot = minimalSnapshot(input);
    socket?.send(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        messageId: `snapshot-${input.tabId}`,
        messageType: "snapshot.push",
        tabId: input.tabId,
        timestamp: 1_000,
        payload: { type: "snapshot.push", ...input, snapshot },
      }),
    );
  };

  const sendLifecycle = (
    messageType: "projection.tab.closed" | "projection.tab.focused",
    tabId: string,
    sessionId: string,
  ): void => {
    socket?.send(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        messageId: `lifecycle-${tabId}`,
        messageType,
        tabId,
        timestamp: 1_000,
        payload: { type: messageType, tabId, sessionId },
      }),
    );
  };

  it("removes a closed tab snapshot and passing verification while heartbeat is live", async () => {
    const { cache, deps } = await startHarness();
    sendSnapshot({
      tabId: "tab-keep",
      sessionId: "session-keep",
      snapshotRev: 1,
      selectionTag: "main",
    });
    sendSnapshot({
      tabId: "tab-closed",
      sessionId: "session-closed",
      snapshotRev: 1,
      selectionTag: "aside",
    });
    socket?.send(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        messageId: "verification-tab-closed",
        messageType: "verification.result",
        tabId: "tab-closed",
        timestamp: 1_100,
        payload: {
          type: "verification.result",
          tabId: "tab-closed",
          sessionId: "session-closed",
          ts: 1_100,
          passed: true,
          details: { assertions: [{ name: "source-updated", passed: true }] },
        },
      }),
    );
    await vi.waitFor(async () => expect((await deps.getVerificationPlan()).passed).toBe(true));

    sendLifecycle("projection.tab.closed", "tab-closed", "session-closed");

    await vi.waitFor(() => expect(cache.getByTab("tab-closed")).toBeUndefined());
    expect(cache.getVerificationResult("tab-closed")).toBeUndefined();
    expect(await deps.getActiveSession()).toMatchObject({
      connected: true,
      sessionId: "session-keep",
    });
    expect((await deps.getVerificationPlan()).passed).not.toBe(true);
  });

  it("changes active MCP tool output on focus without another snapshot", async () => {
    const { cache, deps } = await startHarness();
    sendSnapshot({
      tabId: "tab-focused",
      sessionId: "session-focused",
      snapshotRev: 4,
      selectionTag: "article",
    });
    sendSnapshot({
      tabId: "tab-previous",
      sessionId: "session-previous",
      snapshotRev: 9,
      selectionTag: "nav",
    });
    await vi.waitFor(() => expect(cache.getActive()?.tabId).toBe("tab-previous"));

    sendLifecycle("projection.tab.focused", "tab-focused", "session-focused");

    await vi.waitFor(() => expect(cache.getActive()?.tabId).toBe("tab-focused"));
    expect(await deps.getActiveSession()).toMatchObject({
      connected: true,
      sessionId: "session-focused",
    });
    expect(await deps.getSelection()).toMatchObject({
      elementTag: "article",
      sessionId: "session-focused",
    });
    expect(cache.getActive()?.snapshotRev).toBe(4);
  });

  it("makes a first snapshot authoritative when matching focus arrived first", async () => {
    const { cache, deps } = await startHarness();
    sendSnapshot({
      tabId: "tab-previous",
      sessionId: "session-previous",
      snapshotRev: 1,
      selectionTag: "nav",
    });
    await vi.waitFor(() => expect(cache.getActive()?.tabId).toBe("tab-previous"));
    sendLifecycle("projection.tab.focused", "tab-previous", "session-previous");

    sendLifecycle("projection.tab.focused", "tab-focused", "session-focused");
    sendSnapshot({
      tabId: "tab-focused",
      sessionId: "session-focused",
      snapshotRev: 1,
      selectionTag: "article",
    });

    await vi.waitFor(() => expect(cache.getActive()?.tabId).toBe("tab-focused"));
    expect(await deps.getActiveSession()).toMatchObject({
      connected: true,
      sessionId: "session-focused",
    });
    expect(await deps.getSelection()).toMatchObject({
      elementTag: "article",
      sessionId: "session-focused",
    });
  });

  it("ignores a delayed close from a replaced tab session generation", async () => {
    const { cache } = await startHarness();
    sendSnapshot({
      tabId: "tab-reused",
      sessionId: "session-retired",
      snapshotRev: 9,
      selectionTag: "old-view",
    });
    sendSnapshot({
      tabId: "tab-reused",
      sessionId: "session-current",
      snapshotRev: 1,
      selectionTag: "new-view",
    });
    await vi.waitFor(() => expect(cache.getActive()?.sessionId).toBe("session-current"));

    sendLifecycle("projection.tab.closed", "tab-reused", "session-retired");

    await vi.waitFor(() =>
      expect(cache.getByTab("tab-reused")).toMatchObject({
        sessionId: "session-current",
        snapshotRev: 1,
      }),
    );
  });

  it("ignores delayed focus from a replaced tab session generation", async () => {
    const { cache } = await startHarness();
    sendSnapshot({
      tabId: "tab-reused",
      sessionId: "session-retired",
      snapshotRev: 9,
      selectionTag: "old-view",
    });
    sendSnapshot({
      tabId: "tab-reused",
      sessionId: "session-current",
      snapshotRev: 1,
      selectionTag: "new-view",
    });
    sendSnapshot({
      tabId: "tab-other",
      sessionId: "session-other",
      snapshotRev: 2,
      selectionTag: "other-view",
    });
    await vi.waitFor(() => expect(cache.getActive()?.tabId).toBe("tab-other"));

    sendLifecycle("projection.tab.focused", "tab-reused", "session-retired");

    await vi.waitFor(() => expect(cache.getActive()?.tabId).toBe("tab-other"));
  });
});
