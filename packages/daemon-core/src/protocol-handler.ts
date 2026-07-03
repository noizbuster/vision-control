import type { Logger } from "@vision-control/logger";
import {
  type ChangesetUpdated,
  type DiagnosticReported,
  type Message,
  type NegotiationResult,
  negotiateProtocol,
  type PageNavigated,
  PROTOCOL_VERSION,
  type ProtocolError,
  parseEnvelope,
  parseMessage,
  protocolError,
  type SelectionChanged,
  type SessionHeartbeat,
  type SessionHello,
  type SourceRequest,
  type VerificationRuntimeResult,
} from "@vision-control/protocol";
import type { WebSocket } from "ws";
import {
  buildEnvelope,
  buildErrorEnvelope,
  type EnvelopeBuilderDeps,
  serializeEnvelope,
} from "./envelope-builder.js";
import { createMessageSender, type MessageSender } from "./message-sender.js";

/**
 * A handler slot for one §25.1 browser → daemon message. Receives the parsed
 * payload and a {@link MessageSender} for emitting §25.2 replies. May return a
 * promise; a throw becomes an `INTERNAL_ERROR` envelope (never propagates).
 *
 * Optional: when omitted the dispatch acknowledges the message as a default
 * no-op (Wave 1). Wave 3 (Task 16) wires real services into these slots.
 */
export type BrowserToDaemonHandler<M> = (payload: M, sender: MessageSender) => void | Promise<void>;

export interface ProtocolHandlerDeps extends EnvelopeBuilderDeps {
  readonly logger: Logger;
  /** Called after a successful hello/welcome with the negotiated sessionId. */
  readonly onSessionEstablished?: (sessionId: string) => void;
  readonly onSessionHello?: BrowserToDaemonHandler<SessionHello>;
  readonly onSessionHeartbeat?: BrowserToDaemonHandler<SessionHeartbeat>;
  readonly onPageNavigated?: BrowserToDaemonHandler<PageNavigated>;
  readonly onSelectionChanged?: BrowserToDaemonHandler<SelectionChanged>;
  readonly onChangesetUpdated?: BrowserToDaemonHandler<ChangesetUpdated>;
  readonly onSourceRequest?: BrowserToDaemonHandler<SourceRequest>;
  readonly onVerificationRuntimeResult?: BrowserToDaemonHandler<VerificationRuntimeResult>;
  readonly onDiagnosticReported?: BrowserToDaemonHandler<DiagnosticReported>;
}

/** The result of dispatching one received message. */
export type DispatchResult =
  | { readonly ok: true; readonly sent: readonly string[] }
  | { readonly ok: false; readonly error: ProtocolError };

/**
 * Dispatches incoming protocol envelopes on a WebSocket connection.
 *
 * Handles the `hello` → `welcome` negotiation (delegated to
 * {@link negotiateProtocol}), routes every §25.1 browser → daemon message to
 * its typed handler slot (defaulting to a no-op when the slot is absent), then
 * acknowledges receipt. Emits `error` envelopes (never throwing) for malformed
 * input, version mismatch, or a throwing handler.
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
      return this.handleHello(message, envelope.messageId, socket);
    }

    const sender = createMessageSender(socket, this.deps, envelope.messageId);
    try {
      await this.dispatchBusiness(message, sender);
    } catch (cause) {
      const error = protocolError("INTERNAL_ERROR", {
        type: message.type,
        cause: cause instanceof Error ? cause.message : String(cause),
      });
      this.send(socket, buildErrorEnvelope(error, this.deps, envelope.messageId));
      return { ok: false, error };
    }

    const ack = buildEnvelope("ack", { type: "ack", messageId: envelope.messageId }, this.deps, {
      correlationId: envelope.messageId,
    });
    this.send(socket, ack);
    this.logger.debug("Business message dispatched and acknowledged", {
      type: message.type,
      messageId: envelope.messageId,
    });
    return { ok: true, sent: [serializeEnvelope(ack)] };
  }

  private handleHello(
    message: Extract<Message, { readonly type: "hello" }>,
    messageId: string,
    socket: WebSocket,
  ): DispatchResult {
    const negotiation: NegotiationResult = negotiateProtocol(message, PROTOCOL_VERSION);
    if (!negotiation.ok) {
      this.send(socket, buildErrorEnvelope(negotiation.error, this.deps, messageId));
      return { ok: false, error: negotiation.error };
    }
    const welcome = buildEnvelope("welcome", negotiation.welcome, this.deps, {
      sessionId: negotiation.welcome.sessionId,
      correlationId: messageId,
    });
    this.send(socket, welcome);
    this.onSessionEstablished?.(negotiation.welcome.sessionId);
    return { ok: true, sent: [serializeEnvelope(welcome)] };
  }

  /**
   * Route one parsed non-hello message to its handler slot. Each §25.1 variant
   * invokes the matching optional slot; absent slots no-op. Handshake backbone
   * variants (`welcome`/`error`/`ack`/`nack`) are valid on the wire but have no
   * daemon-side business action — they fall through to acknowledgement. The
   * switch is exhaustive over {@link Message}; adding a union variant without a
   * case is a compile error.
   */
  private async dispatchBusiness(message: Message, sender: MessageSender): Promise<void> {
    switch (message.type) {
      case "session.hello":
        await this.deps.onSessionHello?.(message, sender);
        return;
      case "session.heartbeat":
        await this.deps.onSessionHeartbeat?.(message, sender);
        return;
      case "page.navigated":
        await this.deps.onPageNavigated?.(message, sender);
        return;
      case "selection.changed":
        await this.deps.onSelectionChanged?.(message, sender);
        return;
      case "changeset.updated":
        await this.deps.onChangesetUpdated?.(message, sender);
        return;
      case "source.request":
        await this.deps.onSourceRequest?.(message, sender);
        return;
      case "verification.runtimeResult":
        await this.deps.onVerificationRuntimeResult?.(message, sender);
        return;
      case "diagnostic.reported":
        await this.deps.onDiagnosticReported?.(message, sender);
        return;
      case "hello":
      case "welcome":
      case "error":
      case "ack":
      case "nack":
        // Handshake backbone (`hello` is handled before dispatch). Valid on
        // the wire but carry no daemon-side business action; acknowledged by
        // the caller.
        return;
      case "session.accepted":
      case "workspace.bound":
      case "source.resolved":
      case "context.compiled":
      case "verification.requested":
      case "preview.clearRequested":
      case "configuration.updated":
        // §25.2 outbound variants. The daemon emits these; receiving one
        // inbound is unexpected (a misbehaving client echoing them back).
        // Acknowledge without a business action rather than dropping silently.
        return;
      default:
        return assertNever(message);
    }
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

/** Exhaustiveness guard: a new `Message` variant without a case fails to compile. */
function assertNever(value: never): never {
  throw new Error(`Unhandled message variant: ${JSON.stringify(value)}`);
}
