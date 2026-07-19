import { describe, expect, it } from "vitest";

import { BridgeClient } from "./client.js";
import type { BridgeTarget } from "./pairing.js";
import type { WebSocketLike } from "./websocket.js";

const TARGET: BridgeTarget = {
  host: "127.0.0.1",
  port: 4322,
  wsPath: "/bridge",
  token: "pair-token",
};

class LifecycleSocket implements WebSocketLike {
  readonly OPEN = 1;
  readonly sent: string[] = [];
  onopen: ((this: WebSocketLike) => void) | null = null;
  onmessage: ((this: WebSocketLike, event: { readonly data: string }) => void) | null = null;
  onclose:
    | ((this: WebSocketLike, event: { readonly code?: number; readonly reason?: string }) => void)
    | null = null;
  onerror: ((this: WebSocketLike) => void) | null = null;
  private socketState = 0;

  get readyState(): number {
    return this.socketState;
  }

  open(): void {
    this.socketState = this.OPEN;
    this.onopen?.call(this);
  }

  close(): void {
    this.socketState = 3;
  }

  send(data: string): void {
    this.sent.push(data);
  }
}

async function connectClient() {
  const socket = new LifecycleSocket();
  const client = new BridgeClient({
    factory: () => socket,
    now: () => 1_000,
    uuid: () => "lifecycle-message-id",
  });
  const connection = client.connect(TARGET);
  socket.open();
  await connection;
  return { client, socket };
}

describe("BridgeClient tab lifecycle", () => {
  it("sends a session-bound closed-tab projection fact", async () => {
    const { client, socket } = await connectClient();

    client.clearTab({ tabId: "17", sessionId: "session-17" });

    const sent: unknown = JSON.parse(socket.sent[0] ?? "null");
    expect(sent).toMatchObject({
      messageType: "projection.tab.closed",
      tabId: "17",
      payload: {
        type: "projection.tab.closed",
        tabId: "17",
        sessionId: "session-17",
      },
    });
    client.disconnect();
  });

  it("sends a session-bound focused-tab projection fact", async () => {
    const { client, socket } = await connectClient();

    client.focusTab({ tabId: "23", sessionId: "session-23" });

    const sent: unknown = JSON.parse(socket.sent[0] ?? "null");
    expect(sent).toMatchObject({
      messageType: "projection.tab.focused",
      tabId: "23",
      payload: {
        type: "projection.tab.focused",
        tabId: "23",
        sessionId: "session-23",
      },
    });
    client.disconnect();
  });
});
