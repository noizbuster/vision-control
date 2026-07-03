import type { ProtocolEnvelope } from "../envelope.js";

const BASE_TIMESTAMP = 1_700_000_000_000;

export const validHelloEnvelope: ProtocolEnvelope = {
  protocolVersion: "2.0.0",
  messageId: "msg_hello0001test",
  messageType: "hello",
  timestamp: BASE_TIMESTAMP,
  payload: {
    type: "hello",
    clientVersion: "2.0.0",
    clientCapabilities: ["selection", "verification", "error-reporting"],
  },
};

export const validWelcomeEnvelope: ProtocolEnvelope = {
  protocolVersion: "2.0.0",
  messageId: "msg_welcome001test",
  messageType: "welcome",
  timestamp: BASE_TIMESTAMP + 1,
  payload: {
    type: "welcome",
    serverVersion: "2.0.0",
    serverCapabilities: ["selection"],
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
    sessionToken: "660e8400-e29b-41d4-a716-446655440001",
  },
};

export const validSelectionChangedEnvelope: ProtocolEnvelope = {
  protocolVersion: "2.0.0",
  messageId: "msg_selchg0001test",
  messageType: "selection.changed",
  timestamp: BASE_TIMESTAMP + 2,
  payload: {
    type: "selection.changed",
    elementId: "elem-abc123",
    framePath: ["main"],
  },
};

/**
 * Structurally valid envelope with a future major version. Passes the schema
 * but fails the version-compatibility check in parseEnvelope.
 */
export const versionMismatchEnvelope: ProtocolEnvelope = {
  protocolVersion: "999.0.0",
  messageId: "msg_badver0001test",
  messageType: "hello",
  timestamp: BASE_TIMESTAMP + 3,
  payload: {
    type: "hello",
    clientVersion: "999.0.0",
    clientCapabilities: [],
  },
};

/**
 * Payload with a type literal not in the catalog. parseEnvelope accepts it
 * (payload is unknown); parseMessage rejects it with UNKNOWN_MESSAGE_TYPE.
 */
export const unknownTypePayload = {
  type: "future-message-type",
  data: "unknown to catalog parser",
} as const;

/**
 * Envelope whose hello payload carries an extra field not in the schema.
 * Demonstrates forward compatibility: both parseEnvelope and parseMessage
 * accept it (Zod strips unknown keys by default).
 */
export const additiveFieldEnvelope: ProtocolEnvelope = {
  protocolVersion: "2.0.0",
  messageId: "msg_additive001test",
  messageType: "hello",
  timestamp: BASE_TIMESTAMP + 4,
  payload: {
    type: "hello",
    clientVersion: "2.1.0",
    clientCapabilities: ["selection"],
    futureCapability: "ignored",
  },
};
