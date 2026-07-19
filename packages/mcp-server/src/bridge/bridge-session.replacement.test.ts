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

type ProjectionInput = {
  readonly tabId: string;
  readonly sessionId: string;
};

type ServerSocketRecord = {
  readonly socket: WebSocket;
  readonly baselineMessageListeners: number;
  readonly baselineCloseListeners: number;
};

function openPairedSocket(port: number, pairToken: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/bridge?token=${encodeURIComponent(pairToken)}`,
    );
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function closeSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once("close", () => resolve());
    socket.close();
  });
}

function projectionEnvelopes(input: ProjectionInput): readonly string[] {
  const snapshot = minimalSnapshot({
    tabId: input.tabId,
    snapshotRev: 1,
    sessionId: input.sessionId,
    selectionTag: "main",
  });
  return [
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      messageId: `${input.sessionId}-snapshot`,
      messageType: "snapshot.push",
      tabId: input.tabId,
      timestamp: 1_000,
      payload: {
        type: "snapshot.push",
        tabId: input.tabId,
        snapshotRev: 1,
        sessionId: input.sessionId,
        snapshot,
      },
    }),
    JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      messageId: `${input.sessionId}-verification`,
      messageType: "verification.result",
      tabId: input.tabId,
      timestamp: 1_001,
      payload: {
        type: "verification.result",
        tabId: input.tabId,
        sessionId: input.sessionId,
        ts: 1_001,
        passed: true,
        details: { assertions: [{ name: `${input.sessionId}-assertion` }] },
        commandId: `${input.sessionId}-command`,
      },
    }),
  ];
}

function sendProjection(socket: WebSocket, input: ProjectionInput): void {
  for (const envelope of projectionEnvelopes(input)) socket.send(envelope);
}

describe("bridge session replacement ownership", () => {
  let handle: BridgeServerHandle | undefined;
  const clients: WebSocket[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((socket) => closeSocket(socket)));
    await handle?.stop();
    handle = undefined;
  });

  it("clears old projection and pending commands before a replacement can accept traffic", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue({ uuid: () => "old-command" });
    const session = createBridgeSession({ cache, commands, now: () => 1_000 });
    const pairToken = mintPairToken({ now: () => 0 });
    const serverSockets: ServerSocketRecord[] = [];
    handle = await startBridgeServer({
      port: 0,
      pairToken,
      now: () => 0,
      onPaired: (socket) => {
        serverSockets.push({
          socket,
          baselineMessageListeners: socket.listenerCount("message"),
          baselineCloseListeners: socket.listenerCount("close"),
        });
        session.attach(socket);
      },
    });
    const oldClient = await openPairedSocket(handle.port, pairToken.token);
    clients.push(oldClient);
    sendProjection(oldClient, { tabId: "tab-old", sessionId: "session-old" });
    await vi.waitFor(() => expect(cache.getVerificationResult()?.passed).toBe(true));
    const deps = createProjectionDeps({
      cache,
      commands,
      now: () => 1_000,
      sendCommand: (payload) => session.sendCommand(payload),
    });
    const delivered = new Promise<void>((resolve) => oldClient.once("message", () => resolve()));
    expect((await deps.clearPreview()).acknowledged).toBe(true);
    await delivered;
    expect(commands.pending()).toHaveLength(1);

    const replacementClient = await openPairedSocket(handle.port, pairToken.token);
    clients.push(replacementClient);

    const reset = cache.snapshot();
    expect(reset.paired).toBe(true);
    expect(reset.activeTabId).toBeUndefined();
    expect(reset.byTab.size).toBe(0);
    expect(reset.verificationByTab.size).toBe(0);
    expect(commands.pending()).toEqual([]);
    const oldServer = serverSockets[0];
    expect(oldServer?.socket.listenerCount("message")).toBe(oldServer?.baselineMessageListeners);
    expect(oldServer?.socket.listenerCount("close")).toBe(oldServer?.baselineCloseListeners);

    for (const envelope of projectionEnvelopes({
      tabId: "tab-retired",
      sessionId: "session-retired",
    })) {
      oldServer?.socket.emit("message", Buffer.from(envelope));
    }
    oldServer?.socket.emit("close", 1_000, Buffer.alloc(0));
    expect(cache.snapshot().paired).toBe(true);
    expect(cache.getActive()).toBeUndefined();
    expect(cache.getVerificationResult()).toBeUndefined();

    sendProjection(replacementClient, { tabId: "tab-fresh", sessionId: "session-fresh" });
    await vi.waitFor(() => {
      expect(cache.getActive()?.sessionId).toBe("session-fresh");
      expect(cache.getVerificationResult()?.sessionId).toBe("session-fresh");
    });
  });

  it("releases only session-owned listeners when the current socket closes", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue({ uuid: () => "close-command" });
    commands.enqueue({ kind: "clear_preview", tabId: "tab-close" }, 1_000);
    const session = createBridgeSession({ cache, commands, now: () => 1_000 });
    const pairToken = mintPairToken({ now: () => 0 });
    let serverSocket: ServerSocketRecord | undefined;
    handle = await startBridgeServer({
      port: 0,
      pairToken,
      now: () => 0,
      onPaired: (socket) => {
        serverSocket = {
          socket,
          baselineMessageListeners: socket.listenerCount("message"),
          baselineCloseListeners: socket.listenerCount("close"),
        };
        session.attach(socket);
      },
    });
    const client = await openPairedSocket(handle.port, pairToken.token);
    clients.push(client);
    const closed = new Promise<void>((resolve) =>
      serverSocket?.socket.once("close", () => resolve()),
    );

    client.close();
    await closed;

    expect(serverSocket?.socket.listenerCount("message")).toBe(
      serverSocket?.baselineMessageListeners,
    );
    expect(serverSocket?.socket.listenerCount("close")).toBe(serverSocket?.baselineCloseListeners);
    expect(cache.snapshot().paired).toBe(false);
    expect(commands.pending()).toEqual([]);
  });
});
