import { describe, expect, it } from "vitest";
import {
  additiveFieldEnvelope,
  unknownTypePayload,
  validHelloEnvelope,
  validPageEventEnvelope,
  validWelcomeEnvelope,
  versionMismatchEnvelope,
} from "./__fixtures__/envelopes.js";
import {
  generateJsonSchema,
  isCompatible,
  negotiateProtocol,
  PROTOCOL_VERSION,
  ProtocolErrorSchema,
  parseEnvelope,
  parseMessage,
  parseProtocolVersion,
  protocolError,
} from "./index.js";

describe("protocol version", () => {
  it("parses a valid semver version", () => {
    const result = parseProtocolVersion("1.2.3");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ major: 1, minor: 2, patch: 3 });
    }
  });

  it("rejects an invalid semver string", () => {
    expect(parseProtocolVersion("not-a-version").success).toBe(false);
    expect(parseProtocolVersion("1.2").success).toBe(false);
    expect(parseProtocolVersion("01.2.3").success).toBe(false);
  });

  it("exposes the current protocol version constant", () => {
    expect(PROTOCOL_VERSION).toBe("1.1.0");
  });

  it("isCompatible requires same major and server minor >= client minor", () => {
    const v = (s: string) => {
      const r = parseProtocolVersion(s);
      if (r.success) return r.data;
      throw new Error("unreachable");
    };
    expect(isCompatible(v("1.0.0"), v("1.0.0"))).toBe(true);
    expect(isCompatible(v("1.0.0"), v("1.1.0"))).toBe(true);
    expect(isCompatible(v("1.0.0"), v("1.5.2"))).toBe(true);
    expect(isCompatible(v("1.5.0"), v("1.0.0"))).toBe(false);
    expect(isCompatible(v("1.1.0"), v("1.0.0"))).toBe(false);
    expect(isCompatible(v("1.0.0"), v("2.0.0"))).toBe(false);
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

  it("parses a valid page-event envelope", () => {
    expect(parseEnvelope(validPageEventEnvelope).success).toBe(true);
  });

  it("rejects an envelope with a structurally invalid payload", () => {
    const result = parseEnvelope({ protocolVersion: "1.0.0" });
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

  it("negotiateProtocol rejects a mismatched client version", () => {
    const result = negotiateProtocol(
      {
        type: "hello",
        clientVersion: "999.0.0",
        clientCapabilities: ["page-events"],
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
        clientVersion: "1.0.0",
        clientCapabilities: ["page-events", "session-events", "unknown-cap"],
      },
      PROTOCOL_VERSION,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.welcome.type).toBe("welcome");
      expect(result.welcome.serverVersion).toBe(PROTOCOL_VERSION);
      expect(result.welcome.serverCapabilities).toEqual(["page-events", "session-events"]);
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
