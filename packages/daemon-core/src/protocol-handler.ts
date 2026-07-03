import type { Logger } from "@vision-control/logger";
import {
  type NegotiationResult,
  negotiateProtocol,
  PROTOCOL_VERSION,
  type ProtocolError,
  parseEnvelope,
  parseMessage,
  protocolError,
} from "@vision-control/protocol";
import type { WebSocket } from "ws";
import {
  buildEnvelope,
  buildErrorEnvelope,
  type EnvelopeBuilderDeps,
  serializeEnvelope,
} from "./envelope-builder.js";

export interface ProtocolHandlerDeps extends EnvelopeBuilderDeps {
  readonly logger: Logger;
  /** Called after a successful hello/welcome with the negotiated sessionId. */
  readonly onSessionEstablished?: (sessionId: string) => void;
}

/** The result of dispatching one received message. */
export type DispatchResult =
  | { readonly ok: true; readonly sent: readonly string[] }
  | { readonly ok: false; readonly error: ProtocolError };

/**
 * Dispatches incoming protocol envelopes on a WebSocket connection.
 *
 * Handles the `hello` → `welcome` negotiation (delegated to
 * {@link negotiateProtocol}), replies with `ack` for recognized messages, and
 * emits `error` envelopes (never throwing) for malformed input or version
 * mismatch. All other message types (§25 business catalog) are acked; the
 * daemon does not act on them beyond acknowledging receipt in this layer.
 */
export class ProtocolHandler {
  private readonly logger: Logger;
  private readonly onSessionEstablished: ((sessionId: string) => void) | undefined;

  constructor(private readonly deps: ProtocolHandlerDeps) {
    this.logger = deps.logger;
    this.onSessionEstablished = deps.onSessionEstablished;
  }

  /**
   * Process one raw frame. Parses the envelope, then the message, then
   * dispatches. Sends any reply envelopes on `socket`. Never throws — parse or
   * handler failures are turned into `error` replies.
   */
  async handle(rawData: string, socket: WebSocket): Promise<DispatchResult> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      const error = protocolError("INVALID_PAYLOAD", { reason: "not valid JSON" });
      this.send(socket, buildErrorEnvelope(error, this.deps));
      return { ok: false, error };
    }

    const envelopeResult = parseEnvelope(parsed);
    if (!envelopeResult.success) {
      this.send(socket, buildErrorEnvelope(envelopeResult.error, this.deps));
      return { ok: false, error: envelopeResult.error };
    }
    const envelope = envelopeResult.data;

    const messageResult = parseMessage(envelope.payload);
    if (!messageResult.success) {
      this.send(socket, buildErrorEnvelope(messageResult.error, this.deps, envelope.messageId));
      return { ok: false, error: messageResult.error };
    }
    const message = messageResult.data;

    if (message.type === "hello") {
      const negotiation: NegotiationResult = negotiateProtocol(message, PROTOCOL_VERSION);
      if (!negotiation.ok) {
        this.send(socket, buildErrorEnvelope(negotiation.error, this.deps, envelope.messageId));
        return { ok: false, error: negotiation.error };
      }
      const welcome = buildEnvelope("welcome", negotiation.welcome, this.deps, {
        sessionId: negotiation.welcome.sessionId,
        correlationId: envelope.messageId,
      });
      this.send(socket, welcome);
      this.onSessionEstablished?.(negotiation.welcome.sessionId);
      return { ok: true, sent: [serializeEnvelope(welcome)] };
    }

    // Every other recognized message type is acknowledged in the MVP.
    const ack = buildEnvelope("ack", { type: "ack", messageId: envelope.messageId }, this.deps, {
      correlationId: envelope.messageId,
    });
    this.send(socket, ack);
    this.logger.debug("Message acknowledged", {
      type: message.type,
      messageId: envelope.messageId,
    });
    return { ok: true, sent: [serializeEnvelope(ack)] };
  }

  /** Send a `close` envelope + close the socket after a fatal error. */
  closeWithError(socket: WebSocket, error: ProtocolError): void {
    this.send(socket, buildErrorEnvelope(error, this.deps));
    socket.close(1011, error.code);
  }

  private send(socket: WebSocket, envelope: ReturnType<typeof buildEnvelope>): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(serializeEnvelope(envelope));
    }
  }
}
