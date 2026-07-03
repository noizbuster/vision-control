import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  additiveFieldEnvelope,
  unknownTypePayload,
  validHelloEnvelope,
  validSelectionChangedEnvelope,
  validWelcomeEnvelope,
  versionMismatchEnvelope,
} from "./__fixtures__/envelopes.js";
import {
  browserToDaemonSchemas,
  ChangesetUpdatedSchema,
  DiagnosticReportedSchema,
  PageNavigatedSchema,
  SelectionChangedSchema,
  SessionHeartbeatSchema,
  SessionHelloSchema,
  SourceRequestSchema,
  VerificationRuntimeResultSchema,
} from "./catalog/browser-to-daemon.js";
import {
  ConfigurationUpdatedSchema,
  ContextCompiledSchema,
  daemonToBrowserSchemas,
  PreviewClearRequestedSchema,
  SessionAcceptedSchema,
  SourceResolvedSchema,
  VerificationRequestedSchema,
  WorkspaceBoundSchema,
} from "./catalog/daemon-to-browser.js";
import {
  generateJsonSchema,
  isCompatible,
  negotiateProtocol,
  PROTOCOL_CAPABILITIES,
  PROTOCOL_VERSION,
  ProtocolErrorSchema,
  parseEnvelope,
  parseMessage,
  parseProtocolVersion,
  protocolError,
} from "./index.js";

describe("protocol version", () => {
  it("parses a valid semver version", () => {
    const result = parseProtocolVersion("2.0.3");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ major: 2, minor: 0, patch: 3 });
    }
  });

  it("rejects an invalid semver string", () => {
    expect(parseProtocolVersion("not-a-version").success).toBe(false);
    expect(parseProtocolVersion("2.0").success).toBe(false);
    expect(parseProtocolVersion("02.0.3").success).toBe(false);
  });

  it("exposes the current protocol version constant", () => {
    expect(PROTOCOL_VERSION).toBe("2.0.0");
  });

  it("isCompatible requires same major and server minor >= client minor", () => {
    const v = (s: string) => {
      const r = parseProtocolVersion(s);
      if (r.success) return r.data;
      throw new Error("unreachable");
    };
    expect(isCompatible(v("2.0.0"), v("2.0.0"))).toBe(true);
    expect(isCompatible(v("2.0.0"), v("2.1.0"))).toBe(true);
    expect(isCompatible(v("2.0.0"), v("2.5.2"))).toBe(true);
    expect(isCompatible(v("2.5.0"), v("2.0.0"))).toBe(false);
    expect(isCompatible(v("2.1.0"), v("2.0.0"))).toBe(false);
    expect(isCompatible(v("2.0.0"), v("3.0.0"))).toBe(false);
  });
});

describe("envelope round-trip", () => {
  it("serializes, parses, and equals the original (hello)", () => {
    const json = JSON.stringify(validHelloEnvelope);
    const result = parseEnvelope(JSON.parse(json));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validHelloEnvelope);
    }
  });

  it("parses a valid welcome envelope", () => {
    expect(parseEnvelope(validWelcomeEnvelope).success).toBe(true);
  });

  it("parses a valid selection.changed envelope", () => {
    expect(parseEnvelope(validSelectionChangedEnvelope).success).toBe(true);
  });

  it("rejects an envelope with a structurally invalid payload", () => {
    const result = parseEnvelope({ protocolVersion: "2.0.0" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("INVALID_PAYLOAD");
    }
  });
});

describe("version mismatch", () => {
  it("returns PROTOCOL_VERSION_MISMATCH for a future major version", () => {
    const result = parseEnvelope(versionMismatchEnvelope);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("PROTOCOL_VERSION_MISMATCH");
      expect(result.error.status).toBe(426);
    }
  });

  it("negotiateProtocol rejects a 2.0.0 client ↔ 1.x daemon (client too new)", () => {
    const result = negotiateProtocol(
      {
        type: "hello",
        clientVersion: "2.0.0",
        clientCapabilities: ["selection"],
      },
      "1.1.0",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROTOCOL_VERSION_MISMATCH");
    }
  });

  it("negotiateProtocol rejects a 1.x client ↔ 2.0.0 daemon (client too old)", () => {
    const result = negotiateProtocol(
      {
        type: "hello",
        clientVersion: "1.1.0",
        clientCapabilities: ["selection"],
      },
      "2.0.0",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROTOCOL_VERSION_MISMATCH");
    }
  });

  it("negotiateProtocol rejects a future-major client version", () => {
    const result = negotiateProtocol(
      {
        type: "hello",
        clientVersion: "999.0.0",
        clientCapabilities: ["selection"],
      },
      PROTOCOL_VERSION,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PROTOCOL_VERSION_MISMATCH");
    }
  });

  it("negotiateProtocol rejects a malformed hello payload", () => {
    const result = negotiateProtocol({ type: "hello" }, PROTOCOL_VERSION);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PAYLOAD");
    }
  });
});

describe("unknown message type", () => {
  it("rejects an unknown message type with UNKNOWN_MESSAGE_TYPE", () => {
    const result = parseMessage(unknownTypePayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNKNOWN_MESSAGE_TYPE");
    }
  });

  it("parses a valid hello message payload", () => {
    const result = parseMessage(validHelloEnvelope.payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("hello");
    }
  });

  it("rejects the legacy page-event type (removed in 2.0.0)", () => {
    const result = parseMessage({
      type: "page-event",
      event: "load",
      url: "https://example.com",
      title: "Example",
      framePath: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNKNOWN_MESSAGE_TYPE");
    }
  });

  it("rejects the legacy session-event type (removed in 2.0.0)", () => {
    const result = parseMessage({ type: "session-event", payload: {} });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNKNOWN_MESSAGE_TYPE");
    }
  });
});

describe("additive field compatibility (forward compat)", () => {
  it("parses an envelope whose payload has an extra unknown field", () => {
    expect(parseEnvelope(additiveFieldEnvelope).success).toBe(true);
  });

  it("parses the message payload ignoring the unknown field", () => {
    const result = parseMessage(additiveFieldEnvelope.payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("hello");
    }
  });
});

describe("error taxonomy", () => {
  const codes = [
    "PROTOCOL_VERSION_MISMATCH",
    "UNKNOWN_MESSAGE_TYPE",
    "INVALID_PAYLOAD",
    "MISSING_FIELD",
    "UNAUTHORIZED",
    "ORIGIN_NOT_ALLOWED",
    "SESSION_NOT_FOUND",
    "FRAME_NOT_FOUND",
    "WORKSPACE_NOT_BOUND",
    "RATE_LIMITED",
    "INTERNAL_ERROR",
    "VERIFICATION_FAILED",
  ] as const;

  it("protocolError produces a valid ProtocolError for every code", () => {
    for (const code of codes) {
      const err = protocolError(code);
      expect(ProtocolErrorSchema.safeParse(err).success, `code ${code}`).toBe(true);
      expect(err.code).toBe(code);
      expect(err.status).toBeGreaterThan(0);
      expect(typeof err.message).toBe("string");
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  it("attaches details when provided and omits the key otherwise", () => {
    expect(protocolError("INVALID_PAYLOAD", { field: "x" }).details).toEqual({ field: "x" });
    expect("details" in protocolError("INVALID_PAYLOAD")).toBe(false);
  });
});

describe("negotiation happy path", () => {
  it("returns a welcome with intersected capabilities and fresh session id", () => {
    const result = negotiateProtocol(
      {
        type: "hello",
        clientVersion: "2.0.0",
        clientCapabilities: ["selection", "verification", "unknown-cap"],
      },
      PROTOCOL_VERSION,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.welcome.type).toBe("welcome");
      expect(result.welcome.serverVersion).toBe(PROTOCOL_VERSION);
      expect(result.welcome.serverCapabilities).toEqual(["selection", "verification"]);
      expect(result.welcome.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });
});

describe("JSON schema generation", () => {
  it("produces a valid, JSON-serializable JSON Schema object", () => {
    const schema = generateJsonSchema();
    const json = JSON.stringify(schema);
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.type).toBe("object");
    expect(parsed.properties).toBeDefined();
    const properties = parsed.properties as Record<string, unknown>;
    expect(properties.envelope).toBeDefined();
    expect(properties.message).toBeDefined();
  });
});

// ── §25 catalog round-trip tests ───────────────────────────────────────────

describe("§25 catalog count invariant", () => {
  it("exactly 8 browser→daemon schemas", () => {
    expect(browserToDaemonSchemas).toHaveLength(8);
  });

  it("exactly 7 daemon→browser schemas", () => {
    expect(daemonToBrowserSchemas).toHaveLength(7);
  });

  it("exactly 15 business messages total (8 + 7)", () => {
    expect(browserToDaemonSchemas.length + daemonToBrowserSchemas.length).toBe(15);
  });
});

describe("§25.1 browser→daemon catalog (8 messages)", () => {
  it("PROTOCOL_CAPABILITIES exports exactly 12 capability strings", () => {
    expect(PROTOCOL_CAPABILITIES).toHaveLength(12);
  });

  const cases: Array<{ name: string; schema: z.ZodType; sample: unknown }> = [
    {
      name: "session.hello",
      schema: SessionHelloSchema,
      sample: { type: "session.hello", tabId: "tab-001" },
    },
    {
      name: "session.heartbeat",
      schema: SessionHeartbeatSchema,
      sample: { type: "session.heartbeat", clientTime: 1_700_000_000_000 },
    },
    {
      name: "page.navigated",
      schema: PageNavigatedSchema,
      sample: {
        type: "page.navigated",
        url: "https://example.com",
        title: "Example",
        framePath: ["main"],
      },
    },
    {
      name: "selection.changed",
      schema: SelectionChangedSchema,
      sample: { type: "selection.changed", elementId: "elem-abc", framePath: ["main"] },
    },
    {
      name: "changeset.updated",
      schema: ChangesetUpdatedSchema,
      sample: {
        type: "changeset.updated",
        changesetId: "cs-1",
        revision: 3,
        operations: [{ kind: "style-edit" }],
      },
    },
    {
      name: "source.request",
      schema: SourceRequestSchema,
      sample: { type: "source.request", requestId: "req-1", elementId: "elem-abc" },
    },
    {
      name: "verification.runtimeResult",
      schema: VerificationRuntimeResultSchema,
      sample: { type: "verification.runtimeResult", changesetId: "cs-1", passed: true },
    },
    {
      name: "diagnostic.reported",
      schema: DiagnosticReportedSchema,
      sample: { type: "diagnostic.reported", severity: "warning", message: "contrast low" },
    },
  ];

  for (const { name, schema, sample } of cases) {
    it(`${name} parses + serializes round-trip (serialize → parse → deep-equal)`, () => {
      const json = JSON.stringify(sample);
      const parsed = JSON.parse(json);
      const result = schema.safeParse(parsed);
      expect(result.success, `${name} should parse`).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(sample);
      }
      // parseMessage must also accept it (it's in the union).
      const msgResult = parseMessage(parsed);
      expect(msgResult.success, `${name} should be in the Message union`).toBe(true);
      if (msgResult.success) {
        expect(msgResult.data.type).toBe(name);
      }
    });
  }
});

describe("§25.2 daemon→browser catalog (7 messages)", () => {
  const cases: Array<{ name: string; schema: z.ZodType; sample: unknown }> = [
    {
      name: "session.accepted",
      schema: SessionAcceptedSchema,
      sample: { type: "session.accepted", sessionId: "sess-1" },
    },
    {
      name: "workspace.bound",
      schema: WorkspaceBoundSchema,
      sample: { type: "workspace.bound", fileCount: 42 },
    },
    {
      name: "source.resolved",
      schema: SourceResolvedSchema,
      sample: {
        type: "source.resolved",
        requestId: "req-1",
        elementId: "elem-1",
        sourceToken: "tok-1",
        confidence: "high",
      },
    },
    {
      name: "context.compiled",
      schema: ContextCompiledSchema,
      sample: { type: "context.compiled", contextId: "ctx-1", tokenCount: 500, format: "json" },
    },
    {
      name: "verification.requested",
      schema: VerificationRequestedSchema,
      sample: { type: "verification.requested", changesetId: "cs-1", timeoutMs: 5000 },
    },
    {
      name: "preview.clearRequested",
      schema: PreviewClearRequestedSchema,
      sample: { type: "preview.clearRequested", reason: "verification-reset" },
    },
    {
      name: "configuration.updated",
      schema: ConfigurationUpdatedSchema,
      sample: { type: "configuration.updated", keys: ["privacy.redactSelectors"] },
    },
  ];

  for (const { name, schema, sample } of cases) {
    it(`${name} parses + serializes round-trip (serialize → parse → deep-equal)`, () => {
      const json = JSON.stringify(sample);
      const parsed = JSON.parse(json);
      const result = schema.safeParse(parsed);
      expect(result.success, `${name} should parse`).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(sample);
      }
      const msgResult = parseMessage(parsed);
      expect(msgResult.success, `${name} should be in the Message union`).toBe(true);
      if (msgResult.success) {
        expect(msgResult.data.type).toBe(name);
      }
    });
  }
});

describe("end-to-end: 2.0.0 handshake + typed selection.changed", () => {
  it("negotiates a session then round-trips a selection.changed through the envelope", () => {
    // Step 1: handshake.
    const negotiation = negotiateProtocol(
      {
        type: "hello",
        clientVersion: "2.0.0",
        clientCapabilities: [...PROTOCOL_CAPABILITIES],
      },
      PROTOCOL_VERSION,
    );
    expect(negotiation.ok).toBe(true);
    if (!negotiation.ok) return;

    // Step 2: wrap a selection.changed in a 2.0.0 envelope and round-trip it.
    const envelope = {
      protocolVersion: PROTOCOL_VERSION,
      messageId: "e2e-msg-001",
      messageType: "selection.changed",
      sessionId: negotiation.welcome.sessionId,
      timestamp: Date.now(),
      payload: {
        type: "selection.changed",
        elementId: "btn-submit",
        framePath: ["main", "shadow-root"],
      },
    };
    const envResult = parseEnvelope(envelope);
    expect(envResult.success).toBe(true);
    if (!envResult.success) return;

    const msgResult = parseMessage(envResult.data.payload);
    expect(msgResult.success).toBe(true);
    if (msgResult.success) {
      const msg = msgResult.data;
      expect(msg.type).toBe("selection.changed");
      if (msg.type === "selection.changed") {
        expect(msg.elementId).toBe("btn-submit");
        expect(msg.framePath).toEqual(["main", "shadow-root"]);
      }
    }
  });
});
