export { type ProtocolEnvelope, ProtocolEnvelopeSchema, parseEnvelope } from "./envelope.js";
export {
  type ParseResult,
  type ProtocolError,
  type ProtocolErrorCode,
  ProtocolErrorCodeSchema,
  ProtocolErrorSchema,
  protocolError,
} from "./errors.js";
export { generateJsonSchema, type JsonSchema202012 } from "./json-schema.js";
export {
  type AckMessage,
  AckMessageSchema,
  type ErrorMessage,
  ErrorMessageSchema,
  type HelloMessage,
  HelloMessageSchema,
  type Message,
  MessageSchema,
  type NackMessage,
  NackMessageSchema,
  type PageEventMessage,
  PageEventMessageSchema,
  parseMessage,
  type SessionEventMessage,
  SessionEventMessageSchema,
  type WelcomeMessage,
  WelcomeMessageSchema,
} from "./message-types.js";

export { type NegotiationResult, negotiateProtocol } from "./negotiation.js";
export {
  hasCompatibleMajor,
  isCompatible,
  type ParsedVersion,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_PATTERN,
  parseProtocolVersion,
  type VersionParseResult,
} from "./version.js";
