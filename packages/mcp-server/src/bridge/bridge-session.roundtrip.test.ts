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

describe("bridge session round-trip", () => {
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

  it("Given an open paired socket, when snapshot and command traffic round-trip, then tool reads and acknowledgement match", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue({ uuid: () => "cmd-ws-2" });
    const clock = 1_000;
    const session = createBridgeSession({
      cache,
      commands,
      now: () => clock,
      uuid: () => "envelope-id-2",
    });
    const pairToken = mintPairToken({ now: () => 0 });
    handle = await startBridgeServer({
      port: 0,
      pairToken,
      now: () => 0,
      onPaired: (socket) => session.attach(socket),
    });
    const snapshot = minimalSnapshot({
      tabId: "tab-live",
      snapshotRev: 9,
      sessionId: "sess-live",
      selectionTag: "article",
    });
    const inbound: string[] = [];
    const socket = await new Promise<WebSocket>((resolve, reject) => {
      const candidate = new WebSocket(
        `ws://127.0.0.1:${handle?.port}/bridge?token=${encodeURIComponent(pairToken.token)}`,
      );
      candidate.on("message", (data) => {
        inbound.push(typeof data === "string" ? data : data.toString("utf8"));
      });
      candidate.on("open", () => resolve(candidate));
      candidate.on("error", reject);
    });
    client = socket;
    socket.send(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        messageId: "push-live-01",
        messageType: "snapshot.push",
        tabId: "tab-live",
        timestamp: clock,
        payload: {
          type: "snapshot.push",
          tabId: "tab-live",
          snapshotRev: 9,
          sessionId: "sess-live",
          snapshot,
        },
      }),
    );
    await vi.waitFor(() => expect(cache.getActive()?.snapshotRev).toBe(9));
    const deps = createProjectionDeps({
      cache,
      commands,
      now: () => clock,
      sendCommand: (payload) => session.sendCommand(payload),
    });
    expect(await deps.getSelection()).toMatchObject({
      elementTag: "article",
      sessionId: "sess-live",
    });
    expect(await deps.getSourceContext()).toMatchObject({ tabId: "tab-live", snapshotRev: 9 });

    const clear = await deps.clearPreview();

    expect(clear.acknowledged).toBe(true);
    expect(clear.message).toContain("cmd-ws-2");
    await vi.waitFor(() => expect(inbound.length).toBeGreaterThanOrEqual(1));
    const parsed: unknown = JSON.parse(inbound[0] ?? "{}");
    expect(parsed).toMatchObject({
      messageType: "command.enqueue",
      payload: { kind: "clear_preview", commandId: "cmd-ws-2" },
    });
    socket.send(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        messageId: "ack-msg-01",
        messageType: "command.ack",
        timestamp: clock,
        payload: {
          type: "command.ack",
          commandId: "cmd-ws-2",
          ok: true,
          tabId: "tab-live",
        },
      }),
    );
    await vi.waitFor(() => expect(commands.get("cmd-ws-2")?.status).toBe("acked"));
    socket.close();
  });
});
