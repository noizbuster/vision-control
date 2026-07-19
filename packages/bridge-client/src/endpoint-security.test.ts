import { describe, expect, it, vi } from "vitest";

import { DiscoverResponseSchema, defaultDiscoverResponse, probeDiscover } from "./discover.js";
import {
  BridgeEndpointSchema,
  endpointFromTarget,
  isEndpointPayloadSecretFree,
  parseStoredEndpoint,
} from "./endpoint-store.js";
import {
  BridgeTargetSchema,
  resolveBridgePairingInput,
  synthesizePairingUrlFromHttpPairPage,
  toBridgeWebSocketUrl,
} from "./pairing.js";

const endpoint = {
  host: "127.0.0.1",
  port: 4322,
  wsPath: "/bridge",
};

describe("bridge endpoint security boundaries", () => {
  it.each([
    "vision-control://user:password@pair?token=abc&port=4322&host=127.0.0.1",
    "vision-control:?token=abc&port=4322&host=127.0.0.1",
    "vision-control:///pair?token=abc&port=4322&host=127.0.0.1",
    "vision-control://other?token=abc&port=4322&host=127.0.0.1",
  ])("Given malformed or credential-bearing pair URL %s, when resolved, then it fails", (input) => {
    expect(resolveBridgePairingInput(input).success).toBe(false);
  });

  it.each([
    "token",
    "pairToken",
    "pairingToken",
    "secret",
    "mcpToken",
    "authorization",
    "password",
  ])("Given persisted endpoint field %s, when parsed or inspected, then secret material is rejected", (key) => {
    const raw: Readonly<Record<string, unknown>> = { ...endpoint, [key]: "redacted-fixture" };

    expect(parseStoredEndpoint(raw)).toBeUndefined();
    expect(isEndpointPayloadSecretFree(raw)).toBe(false);
  });

  it.each([
    "apiKey",
    "accessToken",
    "clientSecret",
    "cookie",
    "privateKey",
  ])("Given unknown boundary field %s, when public schemas and persistence consume it, then the shape is rejected", (key) => {
    const value = "redacted-fixture";
    const discover = { ...defaultDiscoverResponse(), [key]: value };
    const target = { token: "abc", ...endpoint, [key]: value };
    const stored = { ...endpoint, [key]: value };

    expect(DiscoverResponseSchema.safeParse(discover).success).toBe(false);
    expect(BridgeTargetSchema.safeParse(target).success).toBe(false);
    expect(BridgeEndpointSchema.safeParse(stored).success).toBe(false);
    expect(parseStoredEndpoint(stored)).toBeUndefined();
    expect(isEndpointPayloadSecretFree(stored)).toBe(false);
  });

  it.each([
    "http://127.0.0.1:4322/wrong",
    "http://127.0.0.1:4322?token=secret",
    "http://127.0.0.1:4322#fragment",
  ])("Given noncanonical discover base %s, when probed, then it rejects before fetch", async (baseUrl) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify(defaultDiscoverResponse()), { status: 200 });
    });

    const result = await probeDiscover({ baseUrl, fetchImpl });

    expect(result.success).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Given a custom pairing authority port, when resolved, then the malformed authority is rejected", () => {
    const result = resolveBridgePairingInput(
      "vision-control://pair:4999?token=abc&port=4322&host=127.0.0.1",
    );

    expect(result.success).toBe(false);
  });

  it.each([
    "vision-control://pair?token=abc&token=other&port=4322&host=127.0.0.1",
    "vision-control://pair?token=abc&port=4322&port=4322&host=127.0.0.1",
    "vision-control://pair?token=abc&port=4322&host=127.0.0.1&host=127.0.0.1",
    "vision-control://pair?token=abc&port=4322&host=127.0.0.1&wsPath=%2Fbridge&wsPath=%2Fbridge",
  ])("Given duplicate custom pairing query keys in %s, when resolved, then ambiguity is rejected", (input) => {
    expect(resolveBridgePairingInput(input).success).toBe(false);
  });

  it.each([
    "vision-control://pair?token=abc&port=4322&host=127.0.0.1&authorization=secret",
    "vision-control://pair?token=abc&port=4322&host=127.0.0.1#fragment",
  ])("Given noncanonical custom pairing query in %s, when resolved, then it is rejected", (input) => {
    expect(resolveBridgePairingInput(input).success).toBe(false);
  });

  it.each([
    "http://127.0.0.1:4322/pair?token=abc&token=other&port=4322&host=127.0.0.1",
    "http://127.0.0.1:4322/pair?token=abc&port=4322&port=4322&host=127.0.0.1",
    "http://127.0.0.1:4322/pair?token=abc&port=4322&host=127.0.0.1&host=127.0.0.1",
  ])("Given duplicate pair-page query keys in %s, when synthesized, then ambiguity is rejected", (input) => {
    expect(synthesizePairingUrlFromHttpPairPage(input).success).toBe(false);
  });

  it.each([
    "http://127.0.0.1:4322/pair?token=abc&port=4322&host=127.0.0.1&wsPath=%2Fwrong",
    "http://127.0.0.1:4322/pair?token=abc&port=4322&host=127.0.0.1&secret=value",
    "http://127.0.0.1:4322/pair?token=abc&port=4322&host=127.0.0.1#fragment",
  ])("Given noncanonical pair-page query in %s, when synthesized, then it is rejected", (input) => {
    expect(synthesizePairingUrlFromHttpPairPage(input).success).toBe(false);
  });

  it.each([
    "/wrong",
    "bridge",
    "/bridge?token=secret",
    "/bridge#secret",
  ])("Given noncanonical WebSocket path %s, when public endpoint boundaries consume it, then every boundary rejects it", (wsPath) => {
    const target = { token: "abc", host: "127.0.0.1", port: 4322, wsPath };
    const discover = { ...defaultDiscoverResponse(), wsPath };

    expect(DiscoverResponseSchema.safeParse(discover).success).toBe(false);
    expect(BridgeTargetSchema.safeParse(target).success).toBe(false);
    expect(BridgeEndpointSchema.safeParse({ ...endpoint, wsPath }).success).toBe(false);
    expect(parseStoredEndpoint({ ...endpoint, wsPath })).toBeUndefined();
    expect(resolveBridgePairingInput("abc", discover).success).toBe(false);
    expect(() => endpointFromTarget(target)).toThrow(/bridge path/);
    expect(() => toBridgeWebSocketUrl(target)).toThrow(/bridge path/);
  });
});
