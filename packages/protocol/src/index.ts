export {
  type ChangesetUpdated,
  ChangesetUpdatedSchema,
  type DiagnosticReported,
  DiagnosticReportedSchema,
  type PageNavigated,
  PageNavigatedSchema,
  type SelectionChanged,
  SelectionChangedSchema,
  type SessionHeartbeat,
  SessionHeartbeatSchema,
  type SessionHello,
  SessionHelloSchema,
  type SourceRequest,
  SourceRequestSchema,
  type VerificationRuntimeResult,
  VerificationRuntimeResultSchema,
} from "./catalog/browser-to-daemon.js";
export {
  type ConfigurationUpdated,
  ConfigurationUpdatedSchema,
  type ContextCompiled,
  ContextCompiledSchema,
  type PreviewClearRequested,
  PreviewClearRequestedSchema,
  type SessionAccepted,
  SessionAcceptedSchema,
  type SourceResolved,
  SourceResolvedSchema,
  type VerificationRequested,
  VerificationRequestedSchema,
  type WorkspaceBound,
  WorkspaceBoundSchema,
} from "./catalog/daemon-to-browser.js";
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
  parseMessage,
  type WelcomeMessage,
  WelcomeMessageSchema,
} from "./message-types.js";

export {
  type NegotiationResult,
  negotiateProtocol,
  PROTOCOL_CAPABILITIES,
} from "./negotiation.js";
export {
  hasCompatibleMajor,
  isCompatible,
  type ParsedVersion,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_PATTERN,
  parseProtocolVersion,
  type VersionParseResult,
} from "./version.js";
