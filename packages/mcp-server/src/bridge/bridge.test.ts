import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import {
  BridgePortInUseError,
  type BridgeServerHandle,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_WS_PATH,
  buildDiscoverResponse,
  DEFAULT_BRIDGE_PORT,
  DISCOVER_PATH,
  FORBIDDEN_DISCOVER_KEYS,
  formatPairingStderrLines,
  mintPairToken,
  NonLoopbackHostError,
  PAIR_TOKEN_TTL_MS,
  startBridgeServer,
  validateLoopbackHost,
  validatePairToken,
} from "./index.js";

describe("discover response shape (ADR-020 C3)", () => {
  it("returns host, port, wsPath, pairTokenRequired, protocolVersion", () => {
    const body = buildDiscoverResponse();
    expect(body).toEqual({
      host: "127.0.0.1",
      port: DEFAULT_BRIDGE_PORT,
      wsPath: BRIDGE_WS_PATH,
      pairTokenRequired: true,
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
    });
  });

  it("never includes a token or secret field", () => {
    const body = buildDiscoverResponse({ port: 4322 });
    const keys = Object.keys(body);
    for (const forbidden of FORBIDDEN_DISCOVER_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
    expect(body.pairTokenRequired).toBe(true);
    expect("token" in body).toBe(false);
  });

  it("locks product port to 4322", () => {
    expect(DEFAULT_BRIDGE_PORT).toBe(4322);
    expect(DISCOVER_PATH).toBe("/discover");
    expect(BRIDGE_WS_PATH).toBe("/bridge");
  });
});

describe("pair token (ADR-020 C3)", () => {
  it("mints a non-empty token with 5-minute TTL", () => {
    const now = 1_000_000;
    const state = mintPairToken({ now: () => now });
    expect(state.token.length).toBeGreaterThan(20);
    expect(state.expiresAt - state.issuedAt).toBe(PAIR_TOKEN_TTL_MS);
    expect(PAIR_TOKEN_TTL_MS).toBe(5 * 60 * 1000);
  });

  it("accepts the correct token before expiry", () => {
    const state = mintPairToken({ now: () => 0, ttlMs: 1000 });
    expect(validatePairToken(state, state.token, 500)).toEqual({ ok: true });
  });

  it("rejects missing, wrong, and expired tokens", () => {
    const state = mintPairToken({ now: () => 0, ttlMs: 1000 });
    expect(validatePairToken(state, undefined, 0).ok).toBe(false);
    expect(validatePairToken(state, "wrong", 0)).toEqual({ ok: false, reason: "mismatch" });
    expect(validatePairToken(state, state.token, 1000)).toEqual({ ok: false, reason: "expired" });
  });

  it("formats pairing lines that include the token for stderr only", () => {
    const state = mintPairToken({ now: () => 0 });
    const lines = formatPairingStderrLines(state, "127.0.0.1", 4322);
    const joined = lines.join("\n");
    expect(joined).toContain(state.token);
    expect(joined).toContain("127.0.0.1:4322/discover");
    expect(joined).toContain("127.0.0.1:4322/bridge");
  });
});

describe("loopback bind guard", () => {
  it("accepts loopback hosts", () => {
    expect(() => validateLoopbackHost("127.0.0.1")).not.toThrow();
    expect(() => validateLoopbackHost("localhost")).not.toThrow();
    expect(() => validateLoopbackHost("::1")).not.toThrow();
  });

  it("refuses non-loopback hosts including 0.0.0.0", () => {
    expect(() => validateLoopbackHost("0.0.0.0")).toThrow(NonLoopbackHostError);
    expect(() => validateLoopbackHost("192.168.1.1")).toThrow(NonLoopbackHostError);
  });
});

describe("bridge server integration", () => {
  let handle: BridgeServerHandle | undefined;

  afterEach(async () => {
    if (handle !== undefined) {
      await handle.stop();
      handle = undefined;
    }
  });

  it("starts without a daemon and serves discover without secrets", async () => {
    const pairToken = mintPairToken();
    handle = await startBridgeServer({ port: 0, pairToken });
    expect(handle.host).toBe("127.0.0.1");

    const response = await fetch(`http://127.0.0.1:${handle.port}/discover`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.host).toBe("127.0.0.1");
    expect(body.port).toBe(handle.port);
    expect(body.wsPath).toBe("/bridge");
    expect(body.pairTokenRequired).toBe(true);
    expect(body.protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION);
    expect(body.token).toBeUndefined();
    expect(body.pairToken).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(pairToken.token);
  });

  it("refuses non-loopback bind before listen", async () => {
    const pairToken = mintPairToken();
    await expect(
      startBridgeServer({ host: "0.0.0.0", port: 0, pairToken }),
    ).rejects.toThrow(NonLoopbackHostError);
  });

  it("fails clearly when the fixed port is busy (no multi-port scan)", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const address = blocker.address();
    if (address === null || typeof address !== "object") {
      throw new Error("expected AddressInfo");
    }
    const busyPort = address.port;
    const pairToken = mintPairToken();
    await expect(startBridgeServer({ port: busyPort, pairToken })).rejects.toThrow(
      BridgePortInUseError,
    );
    await new Promise<void>((resolve) => blocker.close(() => resolve()));
  });

  it("accepts WebSocket pair with the correct token via query", async () => {
    const pairToken = mintPairToken();
    const onPaired = vi.fn();
    handle = await startBridgeServer({ port: 0, pairToken, onPaired });

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${handle?.port}/bridge?token=${encodeURIComponent(pairToken.token)}`,
      );
      ws.on("open", () => {
        expect(onPaired).toHaveBeenCalledOnce();
        ws.close();
        resolve();
      });
      ws.on("error", reject);
    });
  });

  it("rejects WebSocket pair with a wrong token", async () => {
    const pairToken = mintPairToken();
    handle = await startBridgeServer({ port: 0, pairToken });

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${handle?.port}/bridge?token=wrong-token`);
      ws.on("open", () => {
        ws.close();
        reject(new Error("expected upgrade rejection"));
      });
      ws.on("unexpected-response", (_req, res) => {
        expect(res.statusCode).toBe(401);
        resolve();
      });
      ws.on("error", () => {
        // Some Node/ws versions surface reject as error without unexpected-response.
        resolve();
      });
    });
  });

  it("rejects expired pair tokens on upgrade", async () => {
    let now = 0;
    const pairToken = mintPairToken({ now: () => now, ttlMs: 100 });
    handle = await startBridgeServer({
      port: 0,
      pairToken,
      now: () => now,
    });
    now = 200;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(
        `ws://127.0.0.1:${handle?.port}/bridge?token=${encodeURIComponent(pairToken.token)}`,
      );
      ws.on("open", () => {
        ws.close();
        reject(new Error("expired token must not pair"));
      });
      ws.on("unexpected-response", (_req, res) => {
        expect(res.statusCode).toBe(401);
        resolve();
      });
      ws.on("error", () => resolve());
    });
  });
});
