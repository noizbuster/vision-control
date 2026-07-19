import { describe, expect, it, vi } from "vitest";

import { BridgeClient, type WebSocketLike } from "./client.js";

const target = { token: "fixture", host: "127.0.0.1", port: 4322, wsPath: "/bridge" };

function createConnectingSocket(): WebSocketLike {
  return {
    readyState: 0,
    OPEN: 1,
    close: vi.fn(),
    send: vi.fn(),
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
}

describe("bridge client pair failures", () => {
  it("Given a socket factory exception, when connecting, then the attempt rejects without retaining state or token", async () => {
    const client = new BridgeClient({
      factory: () => {
        throw new Error("factory failure");
      },
    });

    await expect(client.connect(target)).rejects.toThrow("factory failure");
    expect(client.state).toBe("disconnected");
    expect(client.getInMemoryToken()).toBeUndefined();
  });

  it("Given a socket closes before opening, when connecting, then the attempt rejects and clears pairing state", async () => {
    const socket = createConnectingSocket();
    const client = new BridgeClient({ factory: () => socket });
    const attempt = client.connect(target);

    socket.onclose?.call(socket, { code: 1006, reason: "closed early" });

    await expect(attempt).rejects.toThrow(/closed during bridge pair/);
    expect(client.state).toBe("disconnected");
    expect(client.getInMemoryToken()).toBeUndefined();
  });

  it("Given a pending pair, when another pair replaces it, then the first attempt rejects and releases its listeners", async () => {
    const sockets: WebSocketLike[] = [];
    const client = new BridgeClient({
      factory: () => {
        const socket = createConnectingSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const firstAttempt = client.connect({ ...target, token: "first" });

    const secondAttempt = client.connect({ ...target, token: "second" });

    await expect(firstAttempt).rejects.toThrow(/superseded/);
    expect(sockets[0]?.onopen).toBeNull();
    expect(sockets[0]?.onmessage).toBeNull();
    expect(sockets[0]?.onclose).toBeNull();
    expect(sockets[0]?.onerror).toBeNull();
    client.disconnect();
    await expect(secondAttempt).rejects.toThrow(/cancelled/);
  });

  it("Given a pending pair, when the client disconnects, then the attempt rejects instead of remaining pending", async () => {
    const socket = createConnectingSocket();
    const client = new BridgeClient({ factory: () => socket });
    const attempt = client.connect(target);

    client.disconnect();

    await expect(attempt).rejects.toThrow(/cancelled/);
  });

  it("Given a pre-open close, when a retained late open callback runs, then it cannot resurrect the client", async () => {
    const socket = createConnectingSocket();
    const client = new BridgeClient({ factory: () => socket });
    const attempt = client.connect(target);
    const lateOpen = socket.onopen;

    socket.onclose?.call(socket, { code: 1006, reason: "closed early" });
    await expect(attempt).rejects.toThrow(/closed during bridge pair/);
    lateOpen?.call(socket);

    expect(client.state).toBe("disconnected");
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(socket.onerror).toBeNull();
  });
});
