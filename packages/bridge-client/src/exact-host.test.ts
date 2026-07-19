import { describe, expect, it, vi } from "vitest";

import { BridgeClient } from "./client.js";
import {
  DiscoverResponseSchema,
  defaultDiscoverResponse,
  parseDiscoverResponse,
  probeDiscover,
} from "./discover.js";
import { BridgeEndpointSchema, endpointFromTarget, parseStoredEndpoint } from "./endpoint-store.js";
import { NonLoopbackHostError } from "./loopback.js";
import {
  BridgeTargetSchema,
  resolveBridgePairingInput,
  synthesizeBridgePairingUrl,
  synthesizePairingUrlFromHttpPairPage,
  toBridgeWebSocketUrl,
} from "./pairing.js";

const PROHIBITED_HOSTS = [
  "localhost",
  "::1",
  "[::1]",
  "0.0.0.0",
  "*",
  "192.168.1.1",
  "127.1",
  "2130706433",
  "0177.0.0.1",
] as const;

const NON_DEFAULT_PORT = 4999;

const discoverBody = (host: string, port = 4322) => ({
  host,
  port,
  wsPath: "/bridge",
  pairTokenRequired: true,
  protocolVersion: "2.0.0",
});

describe("exact bridge host configuration", () => {
  it("Given default discovery, when pairing is resolved, then the approved bridge path is retained", () => {
    const discover = defaultDiscoverResponse();
    const parsed = parseDiscoverResponse(discover);
    const pairing = resolveBridgePairingInput("pair-token", discover);

    expect(parsed).toEqual({ success: true, discover });
    expect(pairing.success).toBe(true);
    if (!pairing.success) {
      return;
    }
    expect(toBridgeWebSocketUrl(pairing.target)).toBe(
      "ws://127.0.0.1:4322/bridge?token=pair-token",
    );
  });

  it.each(
    PROHIBITED_HOSTS,
  )("Given prohibited discover host %s, when the response is parsed, then it fails with the required literal", (host) => {
    const result = parseDiscoverResponse(discoverBody(host));

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.reason).toContain("127.0.0.1");
  });

  it.each([
    "http://localhost:4322",
    "http://[::1]:4322",
    "http://0.0.0.0:4322",
    "http://192.168.1.1:4322",
    "http://127.1:4322",
    "http://2130706433:4322",
    "http://0177.0.0.1:4322",
  ])("Given prohibited discover base %s, when probing, then it fails before network access", async (baseUrl) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify(discoverBody("127.0.0.1")), { status: 200 });
    });

    const result = await probeDiscover({ baseUrl, fetchImpl });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.reason).toContain("127.0.0.1");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:4322",
    "http://[::1]:4322",
    "http://0.0.0.0:4322",
    "http://192.168.1.1:4322",
    "http://127.1:4322",
    "http://2130706433:4322",
    "http://0177.0.0.1:4322",
  ])("Given prohibited pair page base %s, when pairing is synthesized, then it fails with the required literal", (baseUrl) => {
    const result = synthesizePairingUrlFromHttpPairPage(
      `${baseUrl}/pair?token=abc&port=4322&host=127.0.0.1`,
    );

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.reason).toContain("127.0.0.1");
  });

  it.each(
    PROHIBITED_HOSTS,
  )("Given prohibited pairing host %s, when pairing is resolved, then it fails with the required literal", (host) => {
    const input = `vision-control://pair?token=abc&port=4322&host=${encodeURIComponent(host)}`;

    const result = resolveBridgePairingInput(input);

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.reason).toContain("127.0.0.1");
  });

  it.each(
    PROHIBITED_HOSTS,
  )("Given prohibited stored host %s, when the endpoint is parsed, then it is discarded", (host) => {
    expect(parseStoredEndpoint(discoverBody(host))).toBeUndefined();
  });

  it.each(
    PROHIBITED_HOSTS,
  )("Given prohibited host %s, when public bridge schemas parse it, then every schema rejects it", (host) => {
    expect(DiscoverResponseSchema.safeParse(discoverBody(host)).success).toBe(false);
    expect(
      BridgeTargetSchema.safeParse({ token: "abc", host, port: 4322, wsPath: "/bridge" }).success,
    ).toBe(false);
    expect(BridgeEndpointSchema.safeParse(discoverBody(host)).success).toBe(false);
  });

  it("Given a direct localhost target, when public bridge helpers consume it, then typed errors block every bypass", async () => {
    const target = { token: "abc", host: "localhost", port: 4322, wsPath: "/bridge" };
    const factory = vi.fn(() => {
      throw new Error("factory must not be called");
    });
    const client = new BridgeClient({ factory });

    expect(() => toBridgeWebSocketUrl(target)).toThrow(NonLoopbackHostError);
    expect(() => synthesizeBridgePairingUrl("abc", "localhost")).toThrow(NonLoopbackHostError);
    expect(() => endpointFromTarget(target)).toThrow(NonLoopbackHostError);
    await expect(client.connect(target)).rejects.toThrow(NonLoopbackHostError);
    expect(factory).not.toHaveBeenCalled();
  });

  it("Given port 4999, when public schemas and parsers admit client endpoints, then every boundary rejects it", () => {
    const body = discoverBody("127.0.0.1", NON_DEFAULT_PORT);
    const target = {
      token: "abc",
      host: "127.0.0.1",
      port: NON_DEFAULT_PORT,
      wsPath: "/bridge",
    };

    expect(DiscoverResponseSchema.safeParse(body).success).toBe(false);
    expect(BridgeTargetSchema.safeParse(target).success).toBe(false);
    expect(BridgeEndpointSchema.safeParse(body).success).toBe(false);
    expect(parseDiscoverResponse(body).success).toBe(false);
    expect(parseStoredEndpoint(body)).toBeUndefined();
  });

  it("Given port 4999, when discover and pairing inputs are resolved, then no alternate endpoint is accepted", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify(discoverBody("127.0.0.1")), { status: 200 });
    });
    const discover = { ...defaultDiscoverResponse(), port: NON_DEFAULT_PORT };

    const probe = await probeDiscover({
      baseUrl: `http://127.0.0.1:${NON_DEFAULT_PORT}`,
      fetchImpl,
    });

    expect(probe.success).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(resolveBridgePairingInput("abc", discover).success).toBe(false);
    expect(
      resolveBridgePairingInput(
        `vision-control://pair?token=abc&port=${NON_DEFAULT_PORT}&host=127.0.0.1`,
      ).success,
    ).toBe(false);
    expect(
      resolveBridgePairingInput("vision-control://pair?token=abc&port=4322junk&host=127.0.0.1")
        .success,
    ).toBe(false);
  });

  it.each([
    `http://127.0.0.1:${NON_DEFAULT_PORT}/pair?token=abc&port=4322&host=127.0.0.1`,
    `http://127.0.0.1:4322/pair?token=abc&port=${NON_DEFAULT_PORT}&host=127.0.0.1`,
    "http://127.0.0.1:4322/pair?token=abc&port=4322junk&host=127.0.0.1",
    "http://127.0.0.1:4322/pair?token=abc&port=4322.0&host=127.0.0.1",
    "http://127.0.0.1:4322/pair?token=abc&port=%2B4322&host=127.0.0.1",
    "http://127.0.0.1:4322/pair?token=abc&port=04322&host=127.0.0.1",
    "http://127.0.0.1:4322/pair?token=abc&port=4.322e3&host=127.0.0.1",
    "http://127.0.0.1:4322/pair?token=abc&port=%204322&host=127.0.0.1",
  ])("Given alternate pair endpoint %s, when its URL is synthesized, then pairing fails", (input) => {
    expect(synthesizePairingUrlFromHttpPairPage(input).success).toBe(false);
  });

  it.each([
    "4322.0",
    "+4322",
    "04322",
    "4.322e3",
    " 4322",
  ])("Given non-canonical port spelling %s, when a custom pairing URL is resolved, then it fails", (port) => {
    const input = `vision-control://pair?token=abc&port=${encodeURIComponent(port)}&host=127.0.0.1`;

    expect(resolveBridgePairingInput(input).success).toBe(false);
  });

  it("Given a direct port-4999 target, when public URL and persistence helpers consume it, then typed rejection precedes socket access", async () => {
    const target = {
      token: "abc",
      host: "127.0.0.1",
      port: NON_DEFAULT_PORT,
      wsPath: "/bridge",
    };
    const factory = vi.fn(() => {
      throw new Error("factory must not be called");
    });
    const client = new BridgeClient({ factory });

    expect(() => toBridgeWebSocketUrl(target)).toThrow(/4322/);
    expect(() => synthesizeBridgePairingUrl("abc", "127.0.0.1", NON_DEFAULT_PORT)).toThrow(/4322/);
    expect(() => endpointFromTarget(target)).toThrow(/4322/);
    await expect(client.connect(target)).rejects.toThrow(/4322/);
    expect(client.state).toBe("disconnected");
    expect(client.getInMemoryToken()).toBeUndefined();
    expect(factory).not.toHaveBeenCalled();
  });
});
