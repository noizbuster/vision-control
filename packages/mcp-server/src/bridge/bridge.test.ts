import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";

import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_WS_PATH,
  BridgePortInUseError,
  type BridgeServerHandle,
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

function captureBindHostError(host: string): NonLoopbackHostError {
  try {
    validateLoopbackHost(host);
  } catch (error) {
    if (error instanceof NonLoopbackHostError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected NonLoopbackHostError");
}

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

  it.each([
    "localhost",
    "::1",
    "0.0.0.0",
    "192.168.1.1",
  ])("Given prohibited host %s, when discover configuration is built, then it throws the typed host error", (host) => {
    expect(() => buildDiscoverResponse({ host })).toThrow(NonLoopbackHostError);
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
    const tokenOccurrences = joined.split(state.token).length - 1;
    expect(tokenOccurrences).toBe(1);
    expect(joined).toContain("127.0.0.1:4322/discover");
    expect(joined).toContain("127.0.0.1:4322/bridge");
  });
});

describe("exact bridge bind guard", () => {
  it("Given the approved literal, when the bind host is validated, then it is accepted", () => {
    expect(() => validateLoopbackHost("127.0.0.1")).not.toThrow();
  });

  it.each([
    "localhost",
    "::1",
    "[::1]",
    "0.0.0.0",
    "*",
    "192.168.1.1",
  ])("Given prohibited host %s, when the bind host is validated, then an actionable typed error is thrown", (host) => {
    const thrown = captureBindHostError(host);

    expect(thrown.host).toBe(host);
    expect(thrown.message).toContain("127.0.0.1");
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

  it.each([
    "localhost",
    "::1",
    "0.0.0.0",
    "192.168.1.1",
  ])("Given prohibited host %s, when the bridge starts, then bind fails before listen", async (host) => {
    const pairToken = mintPairToken();

    await expect(startBridgeServer({ host, port: 0, pairToken })).rejects.toThrow(
      NonLoopbackHostError,
    );
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
