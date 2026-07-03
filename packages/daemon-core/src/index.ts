export const PACKAGE_NAME = "@vision-control/daemon-core";

export { type AuthDecision, authenticateUpgrade, extractTokenFromUrl } from "./auth.js";
export {
  buildEnvelope,
  buildErrorEnvelope,
  type EnvelopeBuilderDeps,
  serializeEnvelope,
} from "./envelope-builder.js";
export { DaemonCoreError, WorkspaceNotBoundError } from "./errors.js";
export { createMessageSender, type MessageSender } from "./message-sender.js";
export {
  type BrowserToDaemonHandler,
  type DispatchResult,
  ProtocolHandler,
  type ProtocolHandlerDeps,
} from "./protocol-handler.js";
export {
  ChangesetService,
  type ChangesetServiceDeps,
  type PersistChangesetInput,
} from "./services/changeset-service.js";
export { type ConnectionRecord, ConnectionService } from "./services/connection-service.js";
export {
  type PairingIssueResult,
  SessionService,
  type SessionServiceDeps,
  type ValidationResult,
} from "./services/session-service.js";
export {
  type RegisterSourceInput,
  SourceRegistryService,
  type SourceRegistryServiceDeps,
} from "./services/source-registry-service.js";
export {
  CONFIG_FILE_NAME,
  discoverWorkspaceRoot,
  WorkspaceService,
} from "./services/workspace-service.js";
