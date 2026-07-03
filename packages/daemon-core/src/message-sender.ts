import type {
  ConfigurationUpdated,
  ContextCompiled,
  PreviewClearRequested,
  SessionAccepted,
  SourceResolved,
  VerificationRequested,
  WorkspaceBound,
} from "@vision-control/protocol";
import type { WebSocket } from "ws";
import { buildEnvelope, type EnvelopeBuilderDeps, serializeEnvelope } from "./envelope-builder.js";

/**
 * Drop the discriminating `type` field from a message shape. The emitter
 * stamps `type` itself, so callers supply only the data fields — the literal
 * is never repeated at the call site.
 */
type MessageBody<T extends { readonly type: string }> = Omit<T, "type">;

/**
 * Server → client (§25.2) emitters. Each method wraps the payload in a protocol
 * envelope and writes it to the live socket. A sender is scoped to a single
 * inbound message: every emit correlates back to the inbound `messageId`, so a
 * `source.resolved` reply ties cleanly to the `source.request` that prompted it.
 *
 * Wave 1: methods send immediately on the socket held by {@link ProtocolHandler}
 * during dispatch. Wave 3 (Task 16) may swap the transport for a managed
 * connection sink; the interface stays.
 */
export interface MessageSender {
  sendSessionAccepted(body: MessageBody<SessionAccepted>): void;
  sendWorkspaceBound(body: MessageBody<WorkspaceBound>): void;
  sendSourceResolved(body: MessageBody<SourceResolved>): void;
  sendContextCompiled(body: MessageBody<ContextCompiled>): void;
  sendVerificationRequested(body: MessageBody<VerificationRequested>): void;
  sendPreviewClearRequested(body: MessageBody<PreviewClearRequested>): void;
  sendConfigurationUpdated(body: MessageBody<ConfigurationUpdated>): void;
}

/**
 * Build a {@link MessageSender} bound to `socket` and correlated to the inbound
 * `correlationId` (the messageId of the message currently being dispatched).
 * Silently no-ops when the socket is not OPEN, matching {@link ProtocolHandler}'s
 * send contract.
 */
export function createMessageSender(
  socket: WebSocket,
  deps: EnvelopeBuilderDeps,
  correlationId: string,
): MessageSender {
  const emit = (messageType: string, payload: unknown): void => {
    const envelope = buildEnvelope(messageType, payload, deps, { correlationId });
    if (socket.readyState === socket.OPEN) {
      socket.send(serializeEnvelope(envelope));
    }
  };
  return {
    sendSessionAccepted: (body) => emit("session.accepted", { type: "session.accepted", ...body }),
    sendWorkspaceBound: (body) => emit("workspace.bound", { type: "workspace.bound", ...body }),
    sendSourceResolved: (body) => emit("source.resolved", { type: "source.resolved", ...body }),
    sendContextCompiled: (body) => emit("context.compiled", { type: "context.compiled", ...body }),
    sendVerificationRequested: (body) =>
      emit("verification.requested", { type: "verification.requested", ...body }),
    sendPreviewClearRequested: (body) =>
      emit("preview.clearRequested", { type: "preview.clearRequested", ...body }),
    sendConfigurationUpdated: (body) =>
      emit("configuration.updated", { type: "configuration.updated", ...body }),
  };
}
