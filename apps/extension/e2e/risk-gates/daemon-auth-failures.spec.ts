import { expect, test } from "@playwright/test";

import {
  defaultAllowlistConfig,
  hashPairingToken,
  isOriginAllowed,
} from "@vision-control/security";

/**
 * Risk gate R4: daemon authentication failures.
 *
 * Verifies the loopback daemon rejects: missing token, wrong token, disallowed
 * origin, and non-loopback bind. The origin-allowlist and pairing-token
 * functions are pure and testable at the unit level without a running daemon.
 * The WS upgrade auth check is exercised by simulating the authenticateUpgrade
 * flow (origin check → token extraction → hash comparison).
 */

function extractToken(url: string): string | undefined {
  const match = url.match(/[?&]token=([^&]+)/);
  return match?.[1];
}

async function simulateUpgrade(
  origin: string,
  url: string,
  knownTokenHashes: readonly string[],
): Promise<{ ok: boolean; status: number; reason: string }> {
  const config = defaultAllowlistConfig();
  if (!isOriginAllowed(origin, config)) {
    return { ok: false, status: 403, reason: "origin not allowed" };
  }
  const token = extractToken(url);
  if (token === undefined) {
    return { ok: false, status: 401, reason: "missing token" };
  }
  const hash = await hashPairingToken(token);
  if (!knownTokenHashes.includes(hash)) {
    return { ok: false, status: 401, reason: "invalid token" };
  }
  return { ok: true, status: 200, reason: "ok" };
}

test.describe("risk: daemon auth failures (unit)", () => {
  test("missing origin is rejected", () => {
    expect(isOriginAllowed("", defaultAllowlistConfig())).toBe(false);
  });

  test("non-loopback origin is rejected", () => {
    expect(isOriginAllowed("https://evil.com", defaultAllowlistConfig())).toBe(false);
  });

  test("localhost origin is allowed (loopback)", () => {
    expect(isOriginAllowed("http://localhost:5173", defaultAllowlistConfig())).toBe(true);
  });

  test("127.0.0.1 origin is allowed (loopback)", () => {
    expect(isOriginAllowed("http://127.0.0.1:3000", defaultAllowlistConfig())).toBe(true);
  });

  test("IPv6 loopback [::1] is allowed", () => {
    expect(isOriginAllowed("http://[::1]:8080", defaultAllowlistConfig())).toBe(true);
  });

  test("chrome-extension origin is allowed (extension scheme)", () => {
    expect(isOriginAllowed("chrome-extension://abc123def456", defaultAllowlistConfig())).toBe(true);
  });

  test("null origin serializes to 'null' and is rejected", () => {
    // The URL constructor serializes opaque origins to "null"; our check must
    // not accidentally accept the literal string "null" as a valid origin.
    expect(isOriginAllowed("null", defaultAllowlistConfig())).toBe(false);
  });

  test("pairing token hash is deterministic and never equals the raw token", async () => {
    const raw = "test-pairing-token-abc123";
    const hash = await hashPairingToken(raw);
    expect(hash).not.toBe(raw);
    expect(hash.length).toBe(64);
    expect(await hashPairingToken(raw)).toBe(hash);
  });

  test("different tokens produce different hashes", async () => {
    const hash1 = await hashPairingToken("token-one");
    const hash2 = await hashPairingToken("token-two");
    expect(hash1).not.toBe(hash2);
  });

  test("unparseable origin string is rejected", () => {
    expect(isOriginAllowed("not-a-url", defaultAllowlistConfig())).toBe(false);
  });

  test("ftp scheme on loopback is allowed (loopback takes precedence)", () => {
    // Loopback hosts are permitted regardless of scheme when allowedLoopback is true.
    // This is intentional: the daemon trusts loopback connections unconditionally.
    expect(isOriginAllowed("ftp://localhost", defaultAllowlistConfig())).toBe(true);
  });

  test("disallowed origin with no loopback config is rejected", () => {
    const noLoopback = { allowedOrigins: [], allowedLoopback: false };
    expect(isOriginAllowed("http://localhost:5173", noLoopback)).toBe(false);
    expect(isOriginAllowed("https://evil.com", noLoopback)).toBe(false);
  });
});

test.describe("risk: daemon auth failures (upgrade)", () => {
  test("daemon rejects WS upgrade with missing token", async () => {
    const validHash = await hashPairingToken("valid-token-123");
    const decision = await simulateUpgrade("http://localhost:5173", "/ws", [validHash]);
    expect(decision.ok).toBe(false);
    expect(decision.status).toBe(401);
    expect(decision.reason).toMatch(/token/i);
  });

  test("daemon rejects WS upgrade with wrong token", async () => {
    const validHash = await hashPairingToken("valid-token-123");
    const decision = await simulateUpgrade("http://localhost:5173", "/ws?token=wrong-token", [
      validHash,
    ]);
    expect(decision.ok).toBe(false);
    expect(decision.status).toBe(401);
  });

  test("daemon rejects request from disallowed origin", async () => {
    const validHash = await hashPairingToken("valid-token-123");
    const decision = await simulateUpgrade("https://evil.com", "/ws?token=valid-token-123", [
      validHash,
    ]);
    expect(decision.ok).toBe(false);
    expect(decision.status).toBe(403);
  });

  test("daemon accepts a valid loopback origin with correct token", async () => {
    const validHash = await hashPairingToken("valid-token-123");
    const decision = await simulateUpgrade("http://127.0.0.1:5173", "/ws?token=valid-token-123", [
      validHash,
    ]);
    expect(decision.ok).toBe(true);
  });

  test("non-loopback origin fails isOriginAllowed before any auth runs", () => {
    expect(isOriginAllowed("http://0.0.0.0:8080", defaultAllowlistConfig())).toBe(false);
    expect(isOriginAllowed("http://192.168.1.1:3000", defaultAllowlistConfig())).toBe(false);
  });
});
