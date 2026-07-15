import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveSessionTracker } from "./active-session.js";
import { BridgeClient, type WebSocketLike } from "./client.js";
import {
  BRIDGE_ENDPOINT_STORAGE_KEY,
  DEFAULT_BRIDGE_PORT,
  HEARTBEAT_INTERVAL_MS,
  PAIR_TOKEN_TTL_MS,
} from "./constants.js";
import {
  defaultDiscoverResponse,
  FORBIDDEN_DISCOVER_KEYS,
  parseDiscoverResponse,
  probeDiscover,
} from "./discover.js";
import {
  endpointFromTarget,
  isEndpointPayloadSecretFree,
  parseStoredEndpoint,
} from "./endpoint-store.js";
import { isLoopbackHost } from "./loopback.js";
import {
  resolveBridgePairingInput,
  synthesizeBridgePairingUrl,
  toBridgeWebSocketUrl,
} from "./pairing.js";
import { decideSwWakeReconnect } from "./reconnect-policy.js";

describe("discover probe (ADR-020 C3)", () => {
  it("parses secret-free discover JSON with port 4322", () => {
    const result = parseDiscoverResponse({
      host: "127.0.0.1",
      port: 4322,
      wsPath: "/bridge",
      pairTokenRequired: true,
      protocolVersion: "2.0.0",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.discover.port).toBe(DEFAULT_BRIDGE_PORT);
      expect(result.discover.wsPath).toBe("/bridge");
    }
  });

  it("rejects discover bodies that contain a token field", () => {
    const result = parseDiscoverResponse({
      host: "127.0.0.1",
      port: 4322,
      wsPath: "/bridge",
      pairTokenRequired: true,
      protocolVersion: "2.0.0",
      token: "secret",
    });
    expect(result.success).toBe(false);
    for (const key of FORBIDDEN_DISCOVER_KEYS) {
      expect(key).toBeTypeOf("string");
    }
  });

  it("probes only the discover URL and refuses non-loopback bases", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          host: "127.0.0.1",
          port: 4322,
          wsPath: "/bridge",
          pairTokenRequired: true,
          protocolVersion: "2.0.0",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const ok = await probeDiscover({ fetchImpl });
    expect(ok.success).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const firstCall = fetchImpl.mock.calls[0] as unknown as readonly [string, ...unknown[]];
    expect(String(firstCall[0])).toBe("http://127.0.0.1:4322/discover");

    const refused = await probeDiscover({
      fetchImpl,
      baseUrl: "http://evil.example:4322",
    });
    expect(refused.success).toBe(false);
    expect(refused.success === false && refused.reason).toContain("loopback");
  });
});

describe("pairing resolve + WS URL", () => {
  it("resolves bare token with discover defaults on port 4322", () => {
    const result = resolveBridgePairingInput("my-pair-token");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.target).toEqual({
        token: "my-pair-token",
        host: "127.0.0.1",
        port: 4322,
        wsPath: "/bridge",
      });
      expect(toBridgeWebSocketUrl(result.target)).toBe(
        "ws://127.0.0.1:4322/bridge?token=my-pair-token",
      );
    }
  });

  it("resolves vision-control://pair URL and refuses non-loopback host", () => {
    const ok = resolveBridgePairingInput(
      "vision-control://pair?token=abc&port=4322&host=127.0.0.1",
    );
    expect(ok.success).toBe(true);

    const bad = resolveBridgePairingInput(
      "vision-control://pair?token=abc&port=4322&host=evil.com",
    );
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.reason).toContain("loopback");
    }
  });

  it("synthesizes bare-token pairing URL with default port 4322", () => {
    const url = synthesizeBridgePairingUrl("tok");
    expect(url).toContain("port=4322");
    expect(url).toContain("host=127.0.0.1");
  });

  it("uses discover host/port/wsPath when pairing after auto-detect", () => {
    const discover = {
      ...defaultDiscoverResponse(),
      port: 4322,
      wsPath: "/bridge",
    };
    const result = resolveBridgePairingInput("paste-token", discover);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.target.port).toBe(4322);
      expect(result.target.wsPath).toBe("/bridge");
    }
  });
});

describe("endpoint storage (no raw token)", () => {
  it("stores endpoint only and rejects token-bearing payloads", () => {
    const target = {
      token: "secret-token",
      host: "127.0.0.1",
      port: 4322,
      wsPath: "/bridge",
    };
    const endpoint = endpointFromTarget(target, "2.0.0");
    expect(endpoint).toEqual({
      host: "127.0.0.1",
      port: 4322,
      wsPath: "/bridge",
      protocolVersion: "2.0.0",
    });
    expect("token" in endpoint).toBe(false);
    expect(BRIDGE_ENDPOINT_STORAGE_KEY).toBe("vc.bridge.endpoint");

    expect(parseStoredEndpoint(endpoint)).toEqual(endpoint);
    expect(
      parseStoredEndpoint({
        host: "127.0.0.1",
        port: 4322,
        wsPath: "/bridge",
        token: "leaked",
      }),
    ).toBeUndefined();
    expect(isEndpointPayloadSecretFree(endpoint)).toBe(true);
    expect(
      isEndpointPayloadSecretFree({
        host: "127.0.0.1",
        port: 4322,
        wsPath: "/bridge",
        pairToken: "x",
      }),
    ).toBe(false);
  });
});

describe("SW wake re-pair policy (ADR-019 C8)", () => {
  const endpoint = { host: "127.0.0.1", port: 4322, wsPath: "/bridge" };

  it("reconnects when in-memory token is still valid", () => {
    const decision = decideSwWakeReconnect({
      endpoint,
      inMemoryToken: "live-token",
      tokenExpiresAt: 10_000,
      now: 5_000,
    });
    expect(decision).toEqual({
      action: "reconnect",
      endpoint,
      token: "live-token",
    });
  });

  it("requires re-pair when token is missing after SW kill", () => {
    const decision = decideSwWakeReconnect({
      endpoint,
      inMemoryToken: undefined,
      tokenExpiresAt: undefined,
      now: 0,
    });
    expect(decision.action).toBe("re-pair");
    if (decision.action === "re-pair") {
      expect(decision.reason).toBe("no-token");
    }
  });

  it("requires re-pair when token is expired", () => {
    const decision = decideSwWakeReconnect({
      endpoint,
      inMemoryToken: "stale",
      tokenExpiresAt: 1000,
      now: 1000,
    });
    expect(decision.action).toBe("re-pair");
    if (decision.action === "re-pair") {
      expect(decision.reason).toBe("token-expired");
    }
  });
});

describe("BridgeClient auto-detect then pair + unauthenticated reject", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function createFakeSocket(): WebSocketLike & {
    triggerOpen: () => void;
    triggerError: () => void;
    triggerClose: () => void;
    sent: string[];
  } {
    const sent: string[] = [];
    let readyState = 0;
    let onopen: ((this: WebSocketLike) => void) | null = null;
    let onerror: ((this: WebSocketLike) => void) | null = null;
    let onclose:
      | ((this: WebSocketLike, ev: { readonly code?: number; readonly reason?: string }) => void)
      | null = null;
    let onmessage: ((this: WebSocketLike, ev: { readonly data: string }) => void) | null = null;
    const socket: WebSocketLike & {
      triggerOpen: () => void;
      triggerError: () => void;
      triggerClose: () => void;
      sent: string[];
    } = {
      get readyState() {
        return readyState;
      },
      OPEN: 1,
      sent,
      close: () => {
        readyState = 3;
      },
      send: (data: string) => {
        sent.push(data);
      },
      get onopen() {
        return onopen;
      },
      set onopen(handler) {
        onopen = handler;
      },
      get onmessage() {
        return onmessage;
      },
      set onmessage(handler) {
        onmessage = handler;
      },
      get onclose() {
        return onclose;
      },
      set onclose(handler) {
        onclose = handler;
      },
      get onerror() {
        return onerror;
      },
      set onerror(handler) {
        onerror = handler;
      },
      triggerOpen: () => {
        readyState = 1;
        onopen?.call(socket);
      },
      triggerError: () => {
        onerror?.call(socket);
      },
      triggerClose: () => {
        readyState = 3;
        onclose?.call(socket, { code: 1006 });
      },
    };
    return socket;
  }

  it("pairs after discover probe using pasted token", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          host: "127.0.0.1",
          port: 4322,
          wsPath: "/bridge",
          pairTokenRequired: true,
          protocolVersion: "2.0.0",
        }),
        { status: 200 },
      );
    });
    const discover = await probeDiscover({ fetchImpl });
    expect(discover.success).toBe(true);
    if (!discover.success) {
      return;
    }

    const pairing = resolveBridgePairingInput("paste-me", discover.discover);
    expect(pairing.success).toBe(true);
    if (!pairing.success) {
      return;
    }

    let openedUrl = "";
    const fake = createFakeSocket();
    const client = new BridgeClient({
      factory: (url) => {
        openedUrl = url;
        return fake;
      },
      now: () => 1_000,
    });

    const connectPromise = client.connect(pairing.target);
    fake.triggerOpen();
    await connectPromise;

    expect(openedUrl).toBe("ws://127.0.0.1:4322/bridge?token=paste-me");
    expect(client.state).toBe("connected");
    expect(client.getInMemoryToken()).toBe("paste-me");
    expect(client.getEndpoint()).toEqual({
      host: "127.0.0.1",
      port: 4322,
      wsPath: "/bridge",
    });
    expect(client.getTokenExpiresAt()).toBe(1_000 + PAIR_TOKEN_TTL_MS);
  });

  it("rejects unauthenticated connect (socket error before open)", async () => {
    const fake = createFakeSocket();
    const client = new BridgeClient({
      factory: () => fake,
    });
    const pairing = resolveBridgePairingInput("bad-token");
    expect(pairing.success).toBe(true);
    if (!pairing.success) {
      return;
    }

    const connectPromise = client.connect(pairing.target);
    fake.triggerError();
    await expect(connectPromise).rejects.toThrow(/WebSocket error/);
    expect(client.state).toBe("disconnected");
  });

  it("sends session.heartbeat while paired", async () => {
    vi.useFakeTimers();
    const fake = createFakeSocket();
    const client = new BridgeClient({
      factory: () => fake,
      now: () => 42_000,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    });
    const pairing = resolveBridgePairingInput("tok");
    if (!pairing.success) {
      return;
    }
    const connectPromise = client.connect(pairing.target);
    fake.triggerOpen();
    await connectPromise;

    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(fake.sent.length).toBeGreaterThanOrEqual(1);
    const last = JSON.parse(fake.sent[fake.sent.length - 1] ?? "{}") as {
      messageType?: string;
      payload?: { type?: string };
    };
    expect(last.messageType).toBe("session.heartbeat");
    expect(last.payload?.type).toBe("session.heartbeat");
    client.disconnect();
  });
});

describe("ActiveSessionTracker last-focused", () => {
  it("returns last focused paired tab as active session", () => {
    const tracker = new ActiveSessionTracker();
    tracker.markPaired(1);
    tracker.markPaired(2);
    tracker.setFocused(1);
    expect(tracker.getActiveTabId()).toBe(1);
    tracker.setFocused(2);
    expect(tracker.getActiveTabId()).toBe(2);
    tracker.markUnpaired(2);
    expect(tracker.getActiveTabId()).toBe(1);
  });
});

describe("loopback guard", () => {
  it("accepts loopback hosts only", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("192.168.1.1")).toBe(false);
  });
});
