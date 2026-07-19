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

type BridgeMessage = {
  readonly messageType: string;
  readonly payload: unknown;
  readonly tabId: string;
};

function sendBridgeMessage(socket: WebSocket, message: BridgeMessage): void {
  socket.send(
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      messageId: `${message.tabId}-${message.messageType.replaceAll(".", "-")}`,
      messageType: message.messageType,
      tabId: message.tabId,
      timestamp: 1_000,
      payload: message.payload,
    }),
  );
}

describe("projection generation lifecycle", () => {
  let handle: BridgeServerHandle | undefined;
  let client: WebSocket | undefined;

  afterEach(async () => {
    client?.close();
    await handle?.stop();
    client = undefined;
    handle = undefined;
  });

  it("keeps a replacement projection when the old focused generation closes late", async () => {
    const cache = createProjectionCache();
    const session = createBridgeSession({
      cache,
      commands: createCommandQueue(),
      now: () => 1_000,
    });
    const pairToken = mintPairToken({ now: () => 0 });
    handle = await startBridgeServer({
      port: 0,
      pairToken,
      now: () => 0,
      onPaired: (socket) => session.attach(socket),
    });
    const pairedClient = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(
        `ws://127.0.0.1:${handle?.port}/bridge?token=${encodeURIComponent(pairToken.token)}`,
      );
      socket.once("open", () => resolve(socket));
      socket.once("error", reject);
    });
    client = pairedClient;
    await vi.waitFor(() => expect(session.isAttached()).toBe(true));

    sendBridgeMessage(pairedClient, {
      messageType: "snapshot.push",
      tabId: "tab-live",
      payload: {
        type: "snapshot.push",
        tabId: "tab-live",
        sessionId: "session-old",
        snapshotRev: 9,
        snapshot: minimalSnapshot({
          tabId: "tab-live",
          sessionId: "session-old",
          snapshotRev: 9,
        }),
      },
    });
    await vi.waitFor(() => expect(cache.getByTab("tab-live")?.sessionId).toBe("session-old"));
    sendBridgeMessage(pairedClient, {
      messageType: "projection.tab.focused",
      tabId: "tab-live",
      payload: {
        type: "projection.tab.focused",
        tabId: "tab-live",
        sessionId: "session-old",
      },
    });
    await vi.waitFor(() => expect(cache.getActive()?.sessionId).toBe("session-old"));

    sendBridgeMessage(pairedClient, {
      messageType: "snapshot.push",
      tabId: "tab-live",
      payload: {
        type: "snapshot.push",
        tabId: "tab-live",
        sessionId: "session-new",
        snapshotRev: 1,
        snapshot: minimalSnapshot({
          tabId: "tab-live",
          sessionId: "session-new",
          snapshotRev: 1,
        }),
      },
    });
    await vi.waitFor(() => expect(cache.getByTab("tab-live")?.sessionId).toBe("session-new"));

    sendBridgeMessage(pairedClient, {
      messageType: "projection.tab.closed",
      tabId: "tab-live",
      payload: {
        type: "projection.tab.closed",
        tabId: "tab-live",
        sessionId: "session-old",
      },
    });
    sendBridgeMessage(pairedClient, {
      messageType: "projection.tab.focused",
      tabId: "tab-live",
      payload: {
        type: "projection.tab.focused",
        tabId: "tab-live",
        sessionId: "session-new",
      },
    });
    await vi.waitFor(() =>
      expect(cache.getActive()).toMatchObject({ sessionId: "session-new", snapshotRev: 1 }),
    );
    sendBridgeMessage(pairedClient, {
      messageType: "snapshot.push",
      tabId: "tab-live",
      payload: {
        type: "snapshot.push",
        tabId: "tab-live",
        sessionId: "session-new",
        snapshotRev: 2,
        snapshot: minimalSnapshot({
          tabId: "tab-live",
          sessionId: "session-new",
          snapshotRev: 2,
        }),
      },
    });

    await vi.waitFor(() =>
      expect(cache.getActive()).toMatchObject({ sessionId: "session-new", snapshotRev: 2 }),
    );
    expect(cache.getByTab("tab-live")).toMatchObject({
      sessionId: "session-new",
      snapshotRev: 2,
    });
  });

  it("removes an obsolete pass when a newer same-session snapshot is accepted", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue();
    cache.markPaired(100);
    cache.ingest({
      tabId: "tab-live",
      sessionId: "session-current",
      snapshotRev: 1,
      snapshot: minimalSnapshot({
        tabId: "tab-live",
        sessionId: "session-current",
        snapshotRev: 1,
      }),
      ingestedAt: 100,
    });
    cache.setActiveTab("tab-live", "session-current");
    cache.setVerificationResult({
      tabId: "tab-live",
      sessionId: "session-current",
      ts: 101,
      passed: true,
      details: { assertions: [{ name: "old-pass" }] },
      commandId: "old-command",
    });
    const deps = createProjectionDeps({ cache, commands, now: () => 100 });
    expect((await deps.getVerificationPlan()).passed).toBe(true);

    const accepted = cache.ingest({
      tabId: "tab-live",
      sessionId: "session-current",
      snapshotRev: 2,
      snapshot: minimalSnapshot({
        tabId: "tab-live",
        sessionId: "session-current",
        snapshotRev: 2,
      }),
      ingestedAt: 102,
    });

    expect(accepted).toBe(true);
    expect(cache.getVerificationResult("tab-live")).toBeUndefined();
    const plan = await deps.getVerificationPlan();
    expect(plan.passed).not.toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(/"passed"\s*:\s*true/);
  });
});
