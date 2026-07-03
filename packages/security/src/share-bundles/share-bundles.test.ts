import { describe, expect, it } from "vitest";

import { REDACTED_MARKER } from "../redaction-patterns.js";
import {
  BUNDLE_FORMAT_VERSION,
  canonicalJson,
  computeBundleHash,
  containsForbiddenTokenFields,
  createShareBundleAuditEntry,
  exportBundle,
  importBundle,
  type ShareBundle,
  ShareBundleSchema,
  serializeAuditLog,
  signLocal,
  verifyBundleIntegrity,
} from "./index.js";

/** Low-level builder: assemble a structurally-valid, correctly-signed bundle from arbitrary content. */
const buildSignedBundle = async (overrides: Record<string, unknown> = {}): Promise<ShareBundle> => {
  const base: Record<string, unknown> = {
    version: BUNDLE_FORMAT_VERSION,
    workspaceId: "ws-1",
    sessionId: "sess-1",
    changeset: { operations: [] as unknown[] },
    context: { goal: "edit the button" },
    auditLog: [],
    redactionReport: { redactions: [], totalRedacted: 0 },
    createdAt: 1,
  };
  const content = { ...base, ...overrides };
  const hash = await computeBundleHash(content);
  return {
    ...content,
    signature: { algorithm: "sha256-local-v2", value: hash },
    hash,
  } as ShareBundle;
};

describe("share bundle: canonicalization + hashing + signing", () => {
  it("canonicalJson sorts object keys at every depth (insertion-order independent)", () => {
    expect(canonicalJson({ b: 1, a: { y: 2, x: 1 } })).toBe('{"a":{"x":1,"y":2},"b":1}');
  });

  it("computeBundleHash returns a 64-char lowercase hex digest and is deterministic", async () => {
    const hash = await computeBundleHash({ a: 1, b: "two" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await computeBundleHash({ b: "two", a: 1 })).toBe(hash);
  });

  it("computeBundleHash changes when the content changes", async () => {
    const a = await computeBundleHash({ v: 1 });
    const b = await computeBundleHash({ v: 2 });
    expect(a).not.toBe(b);
  });

  it("signLocal produces a sha256-local-v2 signature equal to the content hash", async () => {
    const sig = await signLocal({ x: 1 });
    expect(sig.algorithm).toBe("sha256-local-v2");
    expect(sig.value).toBe(await computeBundleHash({ x: 1 }));
  });
});

describe("share bundle: forbidden-token guard (redaction-aware)", () => {
  it.each([
    "daemonToken",
    "mcpToken",
    "sessionToken",
    "bearer",
    "authorization",
    "cookie",
    "password",
  ])("flags a raw forbidden key: %s", (key) => {
    const scan = containsForbiddenTokenFields({ [key]: "raw-secret-value" });
    expect(scan.found).toBe(true);
    expect(scan.field).toBe(key);
  });

  it("PASSES a forbidden key whose value is already a redaction marker", () => {
    const scan = containsForbiddenTokenFields({
      password: `${REDACTED_MARKER}:sensitive-key:password]`,
      token: "[REDACTED:jwt]",
    });
    expect(scan.found).toBe(false);
  });

  it("flags a forbidden key nested deep in the tree and reports the dot-path", () => {
    const scan = containsForbiddenTokenFields({
      changeset: { operations: [{ target: { sessionToken: "eyJabc.def.ghi" } }] },
    });
    expect(scan.found).toBe(true);
    expect(scan.field).toContain("sessionToken");
  });

  it("is case-insensitive on key names", () => {
    expect(containsForbiddenTokenFields({ SessionToken: "raw" }).found).toBe(true);
    expect(containsForbiddenTokenFields({ PASSWORD: "raw" }).found).toBe(true);
  });

  it("does not flag a clean bundle with no credential-shaped keys", () => {
    const scan = containsForbiddenTokenFields({
      changeset: { operations: [{ kind: "style-edit", value: "red" }] },
      context: { goal: "edit", selectors: [".btn"] },
    });
    expect(scan.found).toBe(false);
  });

  it("does not trip on redaction-report patternId values (they are values, not keys)", () => {
    const scan = containsForbiddenTokenFields({
      redactionReport: { redactions: [{ field: "x", patternId: "password", description: "d" }] },
    });
    expect(scan.found).toBe(false);
  });
});

describe("share bundle: schema validation", () => {
  it("validates a well-formed signed bundle", async () => {
    const bundle = await buildSignedBundle({});
    expect(ShareBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it("rejects an unknown bundle version", async () => {
    const bundle = await buildSignedBundle({ version: "2.0.0" });
    expect(ShareBundleSchema.safeParse(bundle).success).toBe(false);
  });

  it("rejects a bundle missing the hash", async () => {
    const bundle = await buildSignedBundle({});
    const { hash: _hash, ...rest } = bundle;
    void _hash;
    expect(ShareBundleSchema.safeParse(rest).success).toBe(false);
  });

  it("screenshotMetadata is a CLOSED schema: an image-bytes field fails validation", async () => {
    const bundle = await buildSignedBundle({
      screenshotMetadata: { artifactId: "a-1", imageBytes: "iVBORw0KGgo=" },
    });
    expect(ShareBundleSchema.safeParse(bundle).success).toBe(false);
  });

  it("accepts a well-formed screenshotMetadata (metadata ref + redaction report only)", async () => {
    const bundle = await buildSignedBundle({
      screenshotMetadata: {
        artifactId: "a-1",
        redactionReport: "masked",
        redactionSummary: { totalMasked: 2, postCaptureRecheck: "pass" },
        retentionExpiresAt: 9_999,
      },
    });
    expect(ShareBundleSchema.safeParse(bundle).success).toBe(true);
  });
});

describe("share bundle: integrity verification", () => {
  it("verifies an unmodified signed bundle", async () => {
    const bundle = await buildSignedBundle({});
    expect((await verifyBundleIntegrity(bundle)).ok).toBe(true);
  });

  it("detects tampered content (hash mismatch)", async () => {
    const bundle = await buildSignedBundle({});
    const tampered: ShareBundle = {
      ...bundle,
      changeset: { operations: [{ kind: "style-edit", value: "tampered" }] },
    };
    const result = await verifyBundleIntegrity(tampered);
    expect(result.ok).toBe(false);
  });
});

describe("share bundle: audit log", () => {
  it("creates an audit entry with injected id and timestamp", () => {
    const entry = createShareBundleAuditEntry({
      event: "export",
      actor: "cli",
      outcome: "success",
      id: "evt-1",
      timestamp: 100,
      bundleHash: "deadbeef".repeat(8),
    });
    expect(entry.id).toBe("evt-1");
    expect(entry.event).toBe("export");
    expect(entry.bundleHash).toBe("deadbeef".repeat(8));
  });

  it("serializeAuditLog renders one line per entry with provenance", () => {
    const lines = serializeAuditLog([
      createShareBundleAuditEntry({
        event: "export",
        actor: "cli",
        outcome: "success",
        id: "e1",
        timestamp: 5,
        bundleHash: "deadbeef".repeat(8),
      }),
      createShareBundleAuditEntry({
        event: "import",
        actor: "cli",
        outcome: "failure",
        id: "e2",
        timestamp: 9,
        note: "tamper",
      }),
    ]);
    const rendered = String(lines);
    expect(rendered).toContain("export success");
    expect(rendered).toContain("import failure");
    expect(rendered).toContain("note=tamper");
    expect(rendered.split("\n")).toHaveLength(2);
  });
});

describe("share bundle: export", () => {
  it("redacts secrets and records them in the redaction report", async () => {
    const bundle = await exportBundle({
      workspaceId: "ws-1",
      sessionId: "sess-1",
      changeset: { operations: [], note: "password=VC_SECRET_SHOULD_NOT_EXPORT" },
      context: { goal: "edit" },
      now: 100,
      auditId: "exp-1",
    });
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain("VC_SECRET_SHOULD_NOT_EXPORT");
    expect(bundle.redactionReport.totalRedacted).toBeGreaterThanOrEqual(1);
    expect(ShareBundleSchema.safeParse(bundle).success).toBe(true);
  });

  it("DEFAULT excludes screenshots: strips screenshotRef from context and omits screenshotMetadata", async () => {
    const bundle = await exportBundle({
      workspaceId: "ws-1",
      sessionId: "sess-1",
      changeset: { operations: [] },
      context: { goal: "edit", screenshotRef: { artifactId: "should-be-stripped" } },
      now: 100,
      auditId: "exp-2",
    });
    const context = bundle.context as Record<string, unknown>;
    expect(context.screenshotRef).toBeUndefined();
    expect(bundle.screenshotMetadata).toBeUndefined();
  });

  it("OPT-IN includes screenshot metadata only (no image bytes) when explicitly requested", async () => {
    const bundle = await exportBundle({
      workspaceId: "ws-1",
      sessionId: "sess-1",
      changeset: { operations: [] },
      context: { goal: "edit", screenshotRef: { artifactId: "kept" } },
      includeScreenshots: true,
      screenshotMetadata: {
        artifactId: "kept",
        redactionSummary: { totalMasked: 1, postCaptureRecheck: "pass" },
      },
      now: 100,
      auditId: "exp-3",
    });
    expect(bundle.screenshotMetadata).toBeDefined();
    expect(bundle.screenshotMetadata?.artifactId).toBe("kept");
    const serialized = JSON.stringify(bundle.screenshotMetadata);
    expect(serialized).not.toContain("imageBytes");
  });

  it("appends an export audit entry", async () => {
    const bundle = await exportBundle({
      workspaceId: "ws-1",
      sessionId: "sess-1",
      changeset: { operations: [] },
      context: { goal: "edit" },
      now: 100,
      auditId: "exp-4",
    });
    const exportEntries = bundle.auditLog.filter((entry) => entry.event === "export");
    expect(exportEntries).toHaveLength(1);
    expect(exportEntries[0]?.id).toBe("exp-4");
  });

  it("NEGATIVE: never leaks a raw daemon/session token value", async () => {
    const bundle = await exportBundle({
      workspaceId: "ws-1",
      sessionId: "sess-1",
      changeset: { operations: [], config: { authorization: "Bearer VC_RAW_BEARER_TOKEN_123" } },
      context: { goal: "edit" },
      now: 100,
      auditId: "exp-5",
    });
    expect(JSON.stringify(bundle)).not.toContain("VC_RAW_BEARER_TOKEN_123");
  });
});

describe("share bundle: import", () => {
  it("accepts a valid exported bundle and reconstructs the redacted content", async () => {
    const bundle = await exportBundle({
      workspaceId: "ws-1",
      sessionId: "sess-1",
      changeset: { operations: [{ kind: "style-edit", value: "red" }] },
      context: { goal: "edit" },
      now: 100,
      auditId: "exp-1",
    });
    const result = await importBundle(bundle, { now: 200, auditId: "imp-1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reconstructed.changeset).toEqual(bundle.changeset);
      expect(result.auditEntry.event).toBe("import");
      expect(result.auditEntry.bundleHash).toBe(bundle.hash);
    }
  });

  it("NEGATIVE: rejects a tampered bundle (hash mismatch)", async () => {
    const bundle = await exportBundle({
      workspaceId: "ws-1",
      sessionId: "sess-1",
      changeset: { operations: [] },
      context: { goal: "edit" },
      now: 100,
      auditId: "exp-1",
    });
    const tampered = JSON.parse(JSON.stringify(bundle)) as ShareBundle;
    (tampered.context as { goal: string }).goal = "tampered-goal";
    const result = await importBundle(tampered, { now: 200 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("tamper");
  });

  it("NEGATIVE: rejects a bundle carrying a raw forbidden token field", async () => {
    const bundle = await buildSignedBundle({
      changeset: { operations: [], sessionToken: "VC_RAW_SESSION_TOKEN_VALUE" },
    });
    const result = await importBundle(bundle);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("forbidden-token");
    }
    // The raw token value must never surface in the (rejected) bundle's accepted path.
    expect(JSON.stringify(bundle)).toContain("VC_RAW_SESSION_TOKEN_VALUE"); // present in input...
    if (!result.ok && result.error.kind === "forbidden-token") {
      expect(result.error.field).toContain("sessionToken");
    }
  });

  it("accepts a bundle whose forbidden key value is already redacted", async () => {
    const bundle = await buildSignedBundle({
      changeset: { operations: [], password: "[REDACTED:sensitive-key:password]" },
    });
    const result = await importBundle(bundle);
    expect(result.ok).toBe(true);
  });

  it("NEGATIVE: rejects a bundle carrying raw image bytes (data URL)", async () => {
    const bundle = await buildSignedBundle({
      context: { goal: "edit", thumbnail: "data:image/png;base64,iVBORw0KGgo=" },
    });
    const result = await importBundle(bundle);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("screenshot-leak");
  });

  it("NEGATIVE: rejects an expired bundle", async () => {
    const bundle = await buildSignedBundle({ createdAt: 1, expiresAt: 50 });
    const result = await importBundle(bundle, { now: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("expired");
  });

  it("NEGATIVE: rejects malformed JSON input without throwing", async () => {
    const result = await importBundle("not json {");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("schema");
  });
});
