import {
  BridgeClient,
  resolveBridgePairingInput,
  type WebSocketLike,
} from "@vision-control/bridge-client";
import { describe, expect, it } from "vitest";

import { evaluateSwWake, loadBridgeEndpoint, persistBridgeEndpoint } from "./bridge-session.js";

function createMemoryStorage(): {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (key: string) => Promise<void>;
  data: Record<string, unknown>;
} {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key) => ({ [key]: data[key] }),
    set: async (items) => {
      Object.assign(data, items);
    },
    remove: async (key) => {
      delete data[key];
    },
  };
}

function createFakeSocket(): WebSocketLike & { triggerOpen: () => void } {
  let readyState = 0;
  let onopen: ((this: WebSocketLike) => void) | null = null;
  const socket: WebSocketLike & { triggerOpen: () => void } = {
    get readyState() {
      return readyState;
    },
    OPEN: 1,
    close: () => {
      readyState = 3;
    },
    send: () => {},
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    triggerOpen: () => {
      readyState = 1;
      onopen?.call(socket);
    },
  };
  Object.defineProperty(socket, "onopen", {
    get: () => onopen,
    set: (handler: ((this: WebSocketLike) => void) | null) => {
      onopen = handler;
    },
  });
  return socket;
}

describe("bridge-session storage + SW wake", () => {
  it("persists endpoint without token and requires re-pair after SW kill", async () => {
    const storage = createMemoryStorage();
    const fake = createFakeSocket();
    const client = new BridgeClient({ factory: () => fake, now: () => 0 });
    const pairing = resolveBridgePairingInput("tok-abc");
    expect(pairing.success).toBe(true);
    if (!pairing.success) {
      return;
    }
    const connectPromise = client.connect(pairing.target);
    fake.triggerOpen();
    await connectPromise;

    const endpoint = client.getEndpoint();
    expect(endpoint).toBeDefined();
    if (endpoint === undefined) {
      return;
    }
    await persistBridgeEndpoint(storage, endpoint);
    expect(JSON.stringify(storage.data)).not.toContain("tok-abc");

    const loaded = await loadBridgeEndpoint(storage);
    expect(loaded).toEqual(endpoint);

    // Simulate SW kill: new client with no in-memory token, endpoint still stored.
    const decision = evaluateSwWake(undefined, loaded, 0);
    expect(decision.action).toBe("re-pair");
    if (decision.action === "re-pair") {
      expect(decision.reason).toBe("no-token");
    }
  });

  it("reconnects on SW wake when in-memory token is still valid", async () => {
    const fake = createFakeSocket();
    const client = new BridgeClient({ factory: () => fake, now: () => 1000 });
    const pairing = resolveBridgePairingInput("live");
    if (!pairing.success) {
      return;
    }
    const connectPromise = client.connect(pairing.target);
    fake.triggerOpen();
    await connectPromise;

    const decision = evaluateSwWake(client, client.getEndpoint(), 2000);
    expect(decision.action).toBe("reconnect");
    if (decision.action === "reconnect") {
      expect(decision.token).toBe("live");
    }
  });
});
