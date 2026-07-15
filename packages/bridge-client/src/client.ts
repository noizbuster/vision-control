import type { ProtocolEnvelope } from "@vision-control/protocol";

import { HEARTBEAT_INTERVAL_MS, PAIR_TOKEN_TTL_MS } from "./constants.js";
import type { BridgeEndpoint } from "./endpoint-store.js";
import { endpointFromTarget } from "./endpoint-store.js";
import {
  buildCommandAckPayload,
  buildHeartbeatPayload,
  buildSnapshotPushPayload,
  wrapBridgeEnvelope,
} from "./messages.js";
import type { BridgeTarget } from "./pairing.js";
import { toBridgeWebSocketUrl } from "./pairing.js";

/** Connection lifecycle states. */
export type BridgeConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

/**
 * Minimal WebSocket surface. Native WebSocket (browsers + Node 22+) satisfies
 * this; tests inject a fake. Keeps the package free of `ws`.
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

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface BridgeClientOptions {
  readonly factory?: WebSocketFactory;
  readonly setTimeout?: (fn: () => void, ms: number) => TimerHandle;
  readonly clearTimeout?: (handle: TimerHandle) => void;
  readonly uuid?: () => string;
  readonly now?: () => number;
  readonly heartbeatIntervalMs?: number;
  readonly pairTokenTtlMs?: number;
  readonly onStateChange?: (state: BridgeConnectionState) => void;
}

/**
 * MCP bridge WebSocket client (background only).
 *
 * Pair is complete when the socket opens (server validates token on upgrade).
 * The raw pair token stays in memory only; callers persist {@link BridgeEndpoint}.
 */
export class BridgeClient {
  state: BridgeConnectionState = "disconnected";
  private socket: WebSocketLike | undefined;
  private target: BridgeTarget | undefined;
  private tokenExpiresAt: number | undefined;
  private heartbeatTimer: TimerHandle | undefined;
  private readonly factory: WebSocketFactory;
  private readonly setTimeoutFn: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearTimeoutFn: (handle: TimerHandle) => void;
  private readonly uuid: () => string;
  private readonly now: () => number;
  private readonly heartbeatIntervalMs: number;
  private readonly pairTokenTtlMs: number;
  private readonly onStateChange: ((state: BridgeConnectionState) => void) | undefined;
  private readonly messageHandlers = new Set<(envelope: ProtocolEnvelope) => void>();

  constructor(options: BridgeClientOptions = {}) {
    this.factory =
      options.factory ??
      ((url: string) => new globalThis.WebSocket(url) as unknown as WebSocketLike);
    this.setTimeoutFn = options.setTimeout ?? globalThis.setTimeout;
    this.clearTimeoutFn = options.clearTimeout ?? globalThis.clearTimeout;
    this.uuid = options.uuid ?? globalThis.crypto.randomUUID.bind(globalThis.crypto);
    this.now = options.now ?? Date.now;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.pairTokenTtlMs = options.pairTokenTtlMs ?? PAIR_TOKEN_TTL_MS;
    this.onStateChange = options.onStateChange;
  }

  /** Open the bridge socket. Resolves when the WebSocket is open (paired). */
  connect(target: BridgeTarget): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.disconnectSocketOnly();
      this.target = target;
      this.tokenExpiresAt = this.now() + this.pairTokenTtlMs;
      this.setState("connecting");

      const url = toBridgeWebSocketUrl(target);
      const socket = this.factory(url);
      this.socket = socket;

      socket.onopen = () => {
        this.setState("connected");
        this.startHeartbeat();
        resolve();
      };

      socket.onmessage = (ev) => {
        this.handleMessage(ev);
      };

      socket.onclose = () => {
        this.stopHeartbeat();
        if (this.state === "disconnected") {
          return;
        }
        this.setState("disconnected");
      };

      socket.onerror = () => {
        if (this.state === "connecting") {
          this.setState("disconnected");
          reject(new Error("WebSocket error during bridge pair"));
        }
      };
    });
  }

  /** Gracefully disconnect and clear the in-memory token. */
  disconnect(): void {
    this.setState("disconnected");
    this.stopHeartbeat();
    this.target = undefined;
    this.tokenExpiresAt = undefined;
    this.disconnectSocketOnly();
  }

  /** Subscribe to incoming envelopes. Returns unsubscribe. */
  onMessage(handler: (envelope: ProtocolEnvelope) => void): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /** Send a protocol envelope to the bridge. */
  send(messageType: string, payload: unknown, tabId?: string): void {
    const socket = this.socket;
    if (socket === undefined || socket.readyState !== socket.OPEN) {
      throw new Error(`cannot send in state "${this.state}"`);
    }
    const envelope = wrapBridgeEnvelope(
      messageType,
      payload,
      tabId === undefined
        ? { messageId: this.uuid(), timestamp: this.now() }
        : { messageId: this.uuid(), timestamp: this.now(), tabId },
    );
    socket.send(JSON.stringify(envelope));
  }

  /**
   * Push a portable VisionContextSnapshot to the MCP projection cache.
   * Background-only; never invents selection on the MCP side.
   */
  pushSnapshot(input: {
    readonly tabId: string;
    readonly snapshotRev: number;
    readonly sessionId?: string;
    readonly snapshot: unknown;
  }): void {
    const payload = buildSnapshotPushPayload(input);
    this.send("snapshot.push", payload, input.tabId);
  }

  /** Acknowledge a command.enqueue from MCP. */
  ackCommand(input: {
    readonly commandId: string;
    readonly ok: boolean;
    readonly reason?: string;
    readonly tabId?: string;
  }): void {
    const payload = buildCommandAckPayload(input);
    this.send("command.ack", payload, input.tabId);
  }

  /** In-memory pair token (never persisted by this client). */
  getInMemoryToken(): string | undefined {
    return this.target?.token;
  }

  getTokenExpiresAt(): number | undefined {
    return this.tokenExpiresAt;
  }

  /** Endpoint suitable for chrome.storage.local (no token). */
  getEndpoint(): BridgeEndpoint | undefined {
    if (this.target === undefined) {
      return undefined;
    }
    return endpointFromTarget(this.target);
  }

  isInMemoryTokenValid(now: number = this.now()): boolean {
    const token = this.getInMemoryToken();
    if (token === undefined || token.length === 0) {
      return false;
    }
    if (this.tokenExpiresAt !== undefined && now >= this.tokenExpiresAt) {
      return false;
    }
    return true;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = this.setTimeoutFn(() => {
      this.tickHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  private tickHeartbeat(): void {
    if (this.state !== "connected") {
      return;
    }
    const socket = this.socket;
    if (socket !== undefined && socket.readyState === socket.OPEN) {
      this.send("session.heartbeat", buildHeartbeatPayload(this.now()));
    }
    this.heartbeatTimer = this.setTimeoutFn(() => {
      this.tickHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) {
      this.clearTimeoutFn(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private disconnectSocketOnly(): void {
    if (this.socket !== undefined) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.onopen = null;
      this.socket.close(1000, "client disconnect");
      this.socket = undefined;
    }
  }

  private setState(state: BridgeConnectionState): void {
    this.state = state;
    this.onStateChange?.(state);
  }

  private handleMessage(ev: { readonly data: string }): void {
    const envelope = parseIncoming(ev.data);
    if (envelope === undefined) {
      return;
    }
    for (const handler of this.messageHandlers) {
      handler(envelope);
    }
  }
}

function parseIncoming(data: string): ProtocolEnvelope | undefined {
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
