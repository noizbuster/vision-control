import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type BridgeBackgroundController,
  createBridgeBackgroundController,
} from "./bridge-background.js";

type SocketEvent = {
  readonly code?: number;
  readonly data?: string;
  readonly reason?: string;
};

type SocketEventType = "close" | "error" | "message" | "open";

const discoverResponse = (): Response =>
  new Response(
    JSON.stringify({
      host: "127.0.0.1",
      port: 4322,
      wsPath: "/bridge",
      pairTokenRequired: true,
      protocolVersion: "2.0.0",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

class ControlledWebSocket {
  static readonly OPEN = 1;
  static readonly instances: ControlledWebSocket[] = [];

  readonly OPEN = ControlledWebSocket.OPEN;
  readyState = 0;
  private readonly listeners: Record<SocketEventType, Set<(event: SocketEvent) => void>> = {
    close: new Set(),
    error: new Set(),
    message: new Set(),
    open: new Set(),
  };

  constructor(readonly url: string) {
    ControlledWebSocket.instances.push(this);
  }

  addEventListener(type: SocketEventType, listener: (event: SocketEvent) => void): void {
    this.listeners[type].add(listener);
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    for (const listener of this.listeners.close) listener({ code, reason });
  }

  send(_data: string): void {}

  open(): void {
    this.readyState = ControlledWebSocket.OPEN;
    for (const listener of this.listeners.open) listener({});
  }
}

const controllers: BridgeBackgroundController[] = [];

afterEach(() => {
  for (const controller of controllers) controller.unpair();
  controllers.length = 0;
  ControlledWebSocket.instances.length = 0;
  vi.unstubAllGlobals();
});

describe("bridge background concurrent pairing", () => {
  it("retains a newer connected client when the displaced pair rejects later", async () => {
    vi.stubGlobal("WebSocket", ControlledWebSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => discoverResponse()),
    );
    let readyClient: ReturnType<BridgeBackgroundController["getClient"]>;
    const controller = createBridgeBackgroundController({
      storage: undefined,
      onStateChange: () => {},
      onClientReady: (client) => {
        readyClient = client;
      },
    });
    controllers.push(controller);

    const olderPair = controller.pairWithInput("older-pair-material");
    await vi.waitFor(() => expect(ControlledWebSocket.instances).toHaveLength(1));

    const newerPair = controller.pairWithInput("newer-pair-material");
    await vi.waitFor(() => expect(ControlledWebSocket.instances).toHaveLength(2));
    ControlledWebSocket.instances[1]?.open();
    await Promise.all([olderPair, newerPair]);

    expect(controller.getConnectionState()).toBe("connected");
    expect(controller.getClient()).toBeDefined();
    expect(controller.getClient()).toBe(readyClient);
  });

  it("ignores an older pair whose discovery completes after the newer client connects", async () => {
    vi.stubGlobal("WebSocket", ControlledWebSocket);
    const discoveryResolvers: Array<(response: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            discoveryResolvers.push(resolve);
          }),
      ),
    );
    const controller = createBridgeBackgroundController({
      storage: undefined,
      onStateChange: () => {},
    });
    controllers.push(controller);

    const olderPair = controller.pairWithInput("older-delayed-material");
    let olderSettled = false;
    void olderPair.then(() => {
      olderSettled = true;
    });
    await vi.waitFor(() => expect(discoveryResolvers).toHaveLength(1));
    const newerPair = controller.pairWithInput("newer-ready-material");
    await vi.waitFor(() => expect(discoveryResolvers).toHaveLength(2));
    discoveryResolvers[1]?.(discoverResponse());
    await vi.waitFor(() => expect(ControlledWebSocket.instances).toHaveLength(1));
    ControlledWebSocket.instances[0]?.open();
    await newerPair;
    const newerClient = controller.getClient();

    discoveryResolvers[0]?.(discoverResponse());
    await vi.waitFor(() => expect(olderSettled).toBe(true));

    expect(ControlledWebSocket.instances).toHaveLength(1);
    expect(controller.getConnectionState()).toBe("connected");
    expect(controller.getClient()).toBe(newerClient);
  });
});
