import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  createAuditEvent,
  createPrivacyReport,
  defaultAllowlistConfig,
  generatePairingToken,
  hashPairingToken,
  isOriginAllowed,
  looksLikeSecret,
  PAIRING_TOKEN_ENTROPY_BYTES,
  redactObject,
  redactString,
  shannonEntropy,
} from "./index.js";

describe("redaction patterns", () => {
  it("redacts password assignments", () => {
    expect(redactString("password=VC_SECRET_SHOULD_NOT_EXPORT")).toBe(
      "password=[REDACTED:password]",
    );
    expect(redactString("passwd: hunter2")).toBe("passwd=[REDACTED:password]");
    expect(redactString('pwd = "p@ss"')).toBe("pwd=[REDACTED:password]");
  });

  it("redacts api key assignments and known prefixes", () => {
    expect(redactString("api_key=sk_test_12345")).toBe("api_key=[REDACTED:api-key]");
    expect(redactString("sk_live_abcdef0123456789abcdef")).toBe("[REDACTED:api-key]");
    expect(redactString("AKIAIOSFODNN7EXAMPLE")).toBe("[REDACTED:api-key]");
    expect(redactString("token=ghp_abcdefghijklmnopqrstuvwxyz1234567890")).toBe(
      "token=[REDACTED:api-key]",
    );
  });

  it("redacts bearer tokens and authorization headers", () => {
    expect(redactString("authorization: Bearer abc.def.ghi")).toBe(
      "authorization=[REDACTED:auth-header]",
    );
    expect(redactString("Bearer mF_9.B5f-4.1JqM")).toBe("bearer [REDACTED:bearer-token]");
  });

  it("redacts cookies", () => {
    expect(redactString("cookie: session=abc123")).toBe("cookie=[REDACTED:cookie]");
    const redacted = redactString("set-cookie: sid=xyz; HttpOnly");
    expect(redacted).not.toContain("sid=xyz");
    expect(redacted).toContain("[REDACTED:cookie]");
  });

  it("redacts JWTs (three base64url segments)", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4f";
    const redacted = redactString(`token=${jwt}`);
    expect(redacted).not.toContain(jwt);
    expect(redacted).toContain("[REDACTED:jwt]");
  });

  it("redacts credit card numbers and SSN-like patterns", () => {
    expect(redactString("4111 1111 1111 1111")).toBe("[REDACTED:credit-card]");
    expect(redactString("card=4111-1111-1111-1111")).toBe("card=[REDACTED:credit-card]");
    expect(redactString("ssn=123-45-6789")).toBe("ssn=[REDACTED:ssn]");
  });

  it("redacts email addresses", () => {
    expect(redactString("contact user@example.com now")).toContain("[REDACTED:email]");
  });

  it("redacts long high-entropy tokens the regex rules miss", () => {
    const token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const redacted = redactString(`inline ${token} done`);
    expect(redacted).not.toContain(token);
    expect(redacted).toContain("[REDACTED:high-entropy]");
  });
});

describe("redactObject", () => {
  it("redacts credential-shaped keys deeply, leaving other values intact", () => {
    const input = {
      user: "alice",
      password: "VC_SECRET_SHOULD_NOT_EXPORT",
      nested: { apiKey: "sk_live_abcdef0123456789abcdef", count: 3 },
      list: [{ token: "ghp_abcdefghijklmnopqrstuvwxyz1234567890" }],
    };
    const out = redactObject(input) as {
      user: string;
      password: string;
      nested: { apiKey: string; count: number };
      list: Array<{ token: string }>;
    };
    expect(out.user).toBe("alice");
    expect(out.password).toBe("[REDACTED:sensitive-key:password]");
    expect(out.nested.apiKey).toBe("[REDACTED:sensitive-key:apiKey]");
    expect(out.nested.count).toBe(3);
    expect(out.list[0]?.token).toBe("[REDACTED:sensitive-key:token]");
    // input is not mutated
    expect(input.password).toBe("VC_SECRET_SHOULD_NOT_EXPORT");
  });

  it("does not mutate the input and breaks circular references", () => {
    const node: Record<string, unknown> = { name: "x" };
    node.self = node;
    const out = redactObject(node) as Record<string, unknown>;
    expect(out.name).toBe("x");
    expect(out.self).toBe("[REDACTED:circular]");
  });

  it("NEGATIVE: seeded secrets never appear in the output (string form)", () => {
    const seed =
      "password=VC_SECRET_SHOULD_NOT_EXPORT; cookie=session=abc123; api_key=sk_test_12345";
    const out = redactString(seed);
    expect(out).not.toContain("VC_SECRET_SHOULD_NOT_EXPORT");
    expect(out).not.toContain("session=abc123");
    expect(out).not.toContain("sk_test_12345");
  });

  it("NEGATIVE: seeded secrets never appear in the output (object form)", () => {
    const seed = {
      password: "VC_SECRET_SHOULD_NOT_EXPORT",
      cookie: "session=abc123",
      api_key: "sk_test_12345",
    };
    const out = JSON.stringify(redactObject(seed));
    expect(out).not.toContain("VC_SECRET_SHOULD_NOT_EXPORT");
    expect(out).not.toContain("session=abc123");
    expect(out).not.toContain("sk_test_12345");
  });
});

describe("createPrivacyReport", () => {
  it("attributes each redacted leaf to the rule that fired, without leaking values", () => {
    const original = {
      password: "hunter2",
      note: "reach me at user@example.com",
      safe: 42,
    };
    const redacted = redactObject(original);
    const report = createPrivacyReport(original, redacted);
    const reportJson = JSON.stringify(report);
    expect(report.totalRedacted).toBe(2);
    expect(report.redactions.map((r) => r.field)).toEqual(
      expect.arrayContaining(["password", "note"]),
    );
    // The report never carries the original secret values.
    expect(reportJson).not.toContain("hunter2");
    expect(reportJson).not.toContain("user@example.com");
  });
});

describe("secret detection", () => {
  it("flags known credential prefixes", () => {
    expect(looksLikeSecret("sk_live_abcdef0123456789")).toBe(true);
    expect(looksLikeSecret("ghp_abcdefghijklmnopqrstuvwxyz1234567890")).toBe(true);
    expect(looksLikeSecret("AKIAIOSFODNN7EXAMPLE")).toBe(true);
    expect(looksLikeSecret("xoxb-1234567890-1234567890-abcdefghij")).toBe(true);
  });

  it("flags long high-entropy strings", () => {
    const random = "Zj4mQp9Xr2Lv7Nb1Ks8Ty3Wc6Hg5Df3Sa7Qw1";
    expect(shannonEntropy(random)).toBeGreaterThan(4.5);
    expect(looksLikeSecret(random)).toBe(true);
  });

  it("does not flag ordinary short values", () => {
    expect(looksLikeSecret("hello world")).toBe(false);
    expect(looksLikeSecret("127.0.0.1")).toBe(false);
    expect(looksLikeSecret("button")).toBe(false);
  });
});

describe("origin allowlist", () => {
  it("NEGATIVE: rejects a disallowed external origin under the default config", () => {
    expect(isOriginAllowed("https://evil.com", defaultAllowlistConfig())).toBe(false);
  });

  it("accepts loopback origins on any port", () => {
    expect(isOriginAllowed("http://127.0.0.1:3000", defaultAllowlistConfig())).toBe(true);
    expect(isOriginAllowed("http://localhost:5173", defaultAllowlistConfig())).toBe(true);
    expect(isOriginAllowed("http://[::1]:8080", defaultAllowlistConfig())).toBe(true);
  });

  it("accepts the extension origin by default via regex", () => {
    expect(isOriginAllowed("chrome-extension://abcdef123456", defaultAllowlistConfig())).toBe(true);
  });

  it("respects explicit allowedOrigins and disables loopback when asked", () => {
    expect(
      isOriginAllowed("http://localhost:5173", {
        allowedOrigins: [],
        allowedLoopback: false,
      }),
    ).toBe(false);
    expect(
      isOriginAllowed("http://localhost:5173", {
        allowedOrigins: ["http://localhost:5173"],
        allowedLoopback: false,
      }),
    ).toBe(true);
  });

  it("rejects unparseable origins", () => {
    expect(isOriginAllowed("not a url", defaultAllowlistConfig())).toBe(false);
    expect(isOriginAllowed("", defaultAllowlistConfig())).toBe(false);
  });
});

describe("pairing token", () => {
  it("generates a URL-safe base64 token with >= 32 bytes of entropy", () => {
    const token = generatePairingToken({ now: () => 1000 });
    expect(PAIRING_TOKEN_ENTROPY_BYTES).toBe(32);
    expect(token.token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes -> 43 base64url chars (no padding)
    expect(token.token.length).toBe(43);
    expect(token.issuedAt).toBe(1000);
    expect(token.expiresAt).toBeGreaterThan(token.issuedAt);
    expect(token.used).toBe(false);
    expect(token.pairingUrl).toContain(token.token);
  });

  it("is deterministic when randomness is injected", () => {
    const fixed = new Uint8Array(32).fill(0xab);
    const a = generatePairingToken({ now: () => 0, randomBytes: () => fixed });
    const b = generatePairingToken({ now: () => 0, randomBytes: () => fixed });
    expect(a.token).toBe(b.token);
  });

  it("never stores or logs the raw token; the hash differs from the token", async () => {
    const token = generatePairingToken({ now: () => 0 });
    const hash = await hashPairingToken(token.token);
    expect(hash).not.toBe(token.token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("audit event", () => {
  it("constructs and serializes an audit event with injected id and timestamp", () => {
    const event = createAuditEvent({
      type: "auth",
      action: "session.start",
      actor: "extension",
      outcome: "success",
      id: "evt-1",
      timestamp: 42,
      target: "session-xyz",
      metadata: { origin: "chrome-extension://x" },
    });
    expect(event.id).toBe("evt-1");
    expect(event.timestamp).toBe(42);
    expect(event.type).toBe("auth");
    expect(event.outcome).toBe("success");
    expect(event.metadata).toEqual({ origin: "chrome-extension://x" });
    // Round-trips through the schema
    expect(AuditEventSchema.safeParse(event).success).toBe(true);
    expect(() => JSON.stringify(event)).not.toThrow();
  });

  it("fills id and timestamp from defaults and omits optional target", () => {
    const event = createAuditEvent({
      type: "config",
      action: "workspace.bind",
      actor: "daemon",
      outcome: "success",
    });
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.target).toBeUndefined();
  });

  it("rejects unknown event types via the schema", () => {
    expect(
      AuditEventSchema.safeParse({
        id: "x",
        timestamp: 1,
        type: "bogus",
        action: "a",
        actor: "b",
        outcome: "success",
        metadata: {},
      }).success,
    ).toBe(false);
  });
});
