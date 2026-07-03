import {
  PROTOCOL_CAPABILITIES,
  PROTOCOL_VERSION,
  type ProtocolEnvelope,
  type WelcomeMessage,
} from "@vision-control/protocol";
import { type PairingTarget, toWebSocketUrl } from "./pairing.js";

/** Connection lifecycle states. */
export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

/**
 * Minimal WebSocket surface the client depends on. The native `WebSocket`
 * (browsers + Node 22+) satisfies this, and tests inject a fake. Keeping the
 * surface narrow is what lets this package stay isomorphic — no `ws` import.
 */
export interface WebSocketLike {
  readonly readyState: number;
  readonly OPEN: number;
  close(code?: number, reason?: string): void;
  send(data: string): void;
  onopen: ((this: WebSocketLike) => void) | null;
  onmessage: ((this: WebSocketLike, ev: { readonly data: string }) => void) | null;
  onclose:
    | ((this: WebSocketLike, ev: { readonly code?: number; readonly reason?: string }) => void)
    | null;
  onerror: ((this: WebSocketLike) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

/** Exponential-backoff parameters (PRD §30, task spec). */
export interface BackoffOptions {
  readonly initialMs?: number;
  readonly maxMs?: number;
  /** Jitter fraction (0.2 → ±20%). */
  readonly jitter?: number;
  readonly random?: () => number;
}

const DEFAULT_INITIAL_MS = 1000;
const DEFAULT_MAX_MS = 30_000;
const DEFAULT_JITTER = 0.2;

export interface DaemonClientOptions {
  readonly target: PairingTarget;
  readonly factory?: WebSocketFactory;
  readonly backoff?: BackoffOptions;
  /** Client capabilities advertised in the hello handshake. */
  readonly clientCapabilities?: readonly string[];
  readonly clientVersion?: string;
  /** Injectable timers for deterministic tests. */
  readonly setTimeout?: (fn: () => void, ms: number) => TimerHandle;
  readonly clearTimeout?: (handle: TimerHandle) => void;
  readonly uuid?: () => string;
}

/** A timer handle that works under both DOM (`number`) and Node (`Timeout`) lib types. */
export type TimerHandle = ReturnType<typeof setTimeout>;

const DEFAULT_CAPABILITIES: readonly string[] = PROTOCOL_CAPABILITIES;

/**
 * Computes the next reconnect delay using exponential backoff with jitter.
 *
 * Formula: `base = min(initial * 2^attempt, max); delay = base * (1 ± jitter)`.
 * Exposed as a pure function so the backoff curve is unit-testable.
 */
export function computeBackoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const initial = options.initialMs ?? DEFAULT_INITIAL_MS;
  const max = options.maxMs ?? DEFAULT_MAX_MS;
  const jitter = options.jitter ?? DEFAULT_JITTER;
  const random = options.random ?? Math.random;
  const exponent = 2 ** attempt;
  const base = Math.min(initial * exponent, max);
  const jitterFactor = 1 - jitter + random() * jitter * 2;
  return Math.round(base * jitterFactor);
}

/**
 * Isomorphic client for the Vision Control daemon.
 *
 * Connects over a native WebSocket, performs the hello/welcome handshake, and
 * reconnects with exponential backoff when the socket drops. The WebSocket
 * implementation is injectable so tests can drive a fake without touching the
 * network — keeping this package free of `ws` and any Node-only API.
 */
export class DaemonClient {
  state: ConnectionState = "disconnected";
  welcome: WelcomeMessage | undefined;
  private socket: WebSocketLike | undefined;
  private reconnectTimer: TimerHandle | undefined;
  private attempt = 0;
  private readonly factory: WebSocketFactory;
  private readonly backoff: BackoffOptions;
  private readonly clientCapabilities: readonly string[];
  private readonly clientVersion: string;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearTimeoutFn: (handle: TimerHandle) => void;
  private readonly uuid: () => string;
  private readonly messageHandlers = new Set<(envelope: ProtocolEnvelope) => void>();

  constructor(private readonly options: DaemonClientOptions) {
    this.factory =
      options.factory ??
      ((url: string) => new globalThis.WebSocket(url) as unknown as WebSocketLike);
    this.backoff = options.backoff ?? {};
    this.clientCapabilities = options.clientCapabilities ?? DEFAULT_CAPABILITIES;
    this.clientVersion = options.clientVersion ?? PROTOCOL_VERSION;
    this.setTimeoutFn = options.setTimeout ?? globalThis.setTimeout;
    this.clearTimeoutFn = options.clearTimeout ?? globalThis.clearTimeout;
    this.uuid = options.uuid ?? globalThis.crypto.randomUUID.bind(globalThis.crypto);
  }

  /** Open the connection and complete the handshake. Resolves with the welcome message. */
  connect(): Promise<WelcomeMessage> {
    return new Promise<WelcomeMessage>((resolve, reject) => {
      this.state = "connecting";
      const url = toWebSocketUrl(this.options.target);
      const socket = this.factory(url);
      this.socket = socket;

      socket.onopen = () => {
        this.sendHello(socket);
      };

      const onHandshakeMessage = (ev: { readonly data: string }): void => {
        const envelope = this.parseIncoming(ev.data);
        if (envelope === undefined) {
          return;
        }
        if (envelope.messageType === "welcome") {
          socket.onmessage = (msgEv) => {
            this.handleMessage(msgEv);
          };
          this.onConnected(envelope.payload as WelcomeMessage);
          resolve(this.welcome as WelcomeMessage);
        } else if (envelope.messageType === "error") {
          reject(new Error(`handshake rejected: ${JSON.stringify(envelope.payload)}`));
          this.state = "disconnected";
        }
      };

      socket.onmessage = onHandshakeMessage;

      socket.onclose = (ev) => {
        if (this.state === "disconnected") {
          return;
        }
        this.scheduleReconnect(ev);
      };

      socket.onerror = () => {
        if (this.state === "connecting") {
          reject(new Error("WebSocket error during connect"));
        }
      };
    });
  }

  /** Subscribe to incoming envelopes. Returns an unsubscribe function. */
  onMessage(handler: (envelope: ProtocolEnvelope) => void): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /** Send a protocol envelope to the daemon. */
  send(messageType: string, payload: unknown): void {
    const socket = this.socket;
    if (socket === undefined || socket.readyState !== socket.OPEN) {
      throw new Error(`cannot send in state "${this.state}"`);
    }
    const envelope: ProtocolEnvelope = {
      protocolVersion: PROTOCOL_VERSION,
      messageId: this.uuid(),
      messageType,
      payload,
      timestamp: Date.now(),
    };
    socket.send(JSON.stringify(envelope));
  }

  /** Gracefully disconnect and stop reconnecting. */
  disconnect(): void {
    this.state = "disconnected";
    if (this.reconnectTimer !== undefined) {
      this.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.attempt = 0;
    if (this.socket !== undefined) {
      this.socket.onclose = null;
      this.socket.close(1000, "client disconnect");
      this.socket = undefined;
    }
  }

  private sendHello(socket: WebSocketLike): void {
    const hello = {
      protocolVersion: PROTOCOL_VERSION,
      messageId: this.uuid(),
      messageType: "hello",
      payload: {
        type: "hello",
        clientVersion: this.clientVersion,
        clientCapabilities: [...this.clientCapabilities],
      },
      timestamp: Date.now(),
    };
    socket.send(JSON.stringify(hello));
  }

  private onConnected(welcome: WelcomeMessage): void {
    this.welcome = welcome;
    this.state = "connected";
    this.attempt = 0;
  }

  private scheduleReconnect(ev: { readonly code?: number; readonly reason?: string }): void {
    if (this.state === "disconnected") {
      return;
    }
    this.state = "reconnecting";
    const delay = computeBackoffDelay(this.attempt, this.backoff);
    this.attempt += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.connect().catch(() => {
        // A failed reconnect attempt schedules the next backoff via onclose.
      });
    }, delay);
    // Ev fields are intentionally not actioned beyond triggering reconnect.
    void ev;
  }

  private handleMessage(ev: { readonly data: string }): void {
    const envelope = this.parseIncoming(ev.data);
    if (envelope === undefined) {
      return;
    }
    for (const handler of this.messageHandlers) {
      handler(envelope);
    }
  }

  private parseIncoming(data: string): ProtocolEnvelope | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return undefined;
    }
    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }
    const obj = parsed as Record<string, unknown>;
    if (
      typeof obj.protocolVersion !== "string" ||
      typeof obj.messageId !== "string" ||
      typeof obj.messageType !== "string"
    ) {
      return undefined;
    }
    return parsed as ProtocolEnvelope;
  }
}
