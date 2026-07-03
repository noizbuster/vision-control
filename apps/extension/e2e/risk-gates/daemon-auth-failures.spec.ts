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
 */

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

test.describe("risk: daemon auth failures (browser)", () => {
  test.fixme("daemon rejects WS upgrade with missing token", async () => {
    // Given: the daemon is running with a valid session.
    // When: a WS client connects without a ?token= query parameter.
    // Then: the upgrade is rejected with HTTP 401 (UNAUTHORIZED).
    // Assert: the connection is destroyed; no session is established.
  });

  test.fixme("daemon rejects WS upgrade with wrong token", async () => {
    // Given: the daemon is running.
    // When: a WS client connects with an invalid token hash.
    // Then: the upgrade is rejected with HTTP 401.
    // Assert: findByTokenHash returns undefined; connection destroyed.
  });

  test.fixme("daemon rejects request from disallowed origin", async () => {
    // Given: the daemon is running.
    // When: a request arrives with Origin: https://evil.com.
    // Then: the upgrade is rejected with HTTP 403 (ORIGIN_NOT_ALLOWED).
    // Assert: isOriginAllowed returns false before any auth logic runs.
  });

  test.fixme("daemon refuses to bind on non-loopback interface", async () => {
    // Given: the daemon config specifies host: "0.0.0.0".
    // When: the daemon attempts to bind.
    // Then: binding is refused (loopback-only policy enforced).
    // Assert: the daemon reports a bind error and exits.
  });
});
