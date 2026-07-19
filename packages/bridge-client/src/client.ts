import type { ProtocolEnvelope } from "@vision-control/protocol";

import { HEARTBEAT_INTERVAL_MS, PAIR_TOKEN_TTL_MS } from "./constants.js";
import type { BridgeEndpoint } from "./endpoint-store.js";
import { endpointFromTarget } from "./endpoint-store.js";
import { parseIncoming } from "./incoming.js";
import {
  buildCommandAckPayload,
  buildHeartbeatPayload,
  buildProjectionTabClosedPayload,
  buildProjectionTabFocusedPayload,
  buildSnapshotPushPayload,
  buildVerificationResultPayload,
  wrapBridgeEnvelope,
} from "./messages.js";
import type { BridgeTarget } from "./pairing.js";
import { toBridgeWebSocketUrl } from "./pairing.js";
import { createNativeWebSocket, type WebSocketFactory, type WebSocketLike } from "./websocket.js";

/** Connection lifecycle states. */
export type BridgeConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

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
  private pendingConnectReject: ((reason: Error) => void) | undefined;

  constructor(options: BridgeClientOptions = {}) {
    this.factory = options.factory ?? createNativeWebSocket;
    this.setTimeoutFn = options.setTimeout ?? globalThis.setTimeout;
    this.clearTimeoutFn = options.clearTimeout ?? globalThis.clearTimeout;
    this.uuid = options.uuid ?? globalThis.crypto.randomUUID.bind(globalThis.crypto);
    this.now = options.now ?? Date.now;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
    this.pairTokenTtlMs = options.pairTokenTtlMs ?? PAIR_TOKEN_TTL_MS;
    this.onStateChange = options.onStateChange;
  }

  /** Open the bridge socket. Resolves when the WebSocket is open (paired). */
  async connect(target: BridgeTarget): Promise<void> {
    const url = toBridgeWebSocketUrl(target);
    const socket = this.factory(url);
    await new Promise<void>((resolve, reject) => {
      this.disconnectSocketOnly(new Error("Bridge pair attempt superseded"));
      this.target = target;
      this.tokenExpiresAt = this.now() + this.pairTokenTtlMs;
      this.setState("connecting");

      this.socket = socket;
      this.pendingConnectReject = reject;

      socket.onopen = () => {
        if (this.socket !== socket) {
          return;
        }
        this.pendingConnectReject = undefined;
        this.setState("connected");
        this.startHeartbeat();
        resolve();
      };

      socket.onmessage = (ev) => {
        if (this.socket !== socket) {
          return;
        }
        this.handleMessage(ev);
      };

      socket.onclose = (event) => {
        if (this.socket !== socket) {
          return;
        }
        this.stopHeartbeat();
        const wasConnecting = this.state === "connecting";
        const rejectPending = this.pendingConnectReject;
        this.pendingConnectReject = undefined;
        this.clearSocketHandlers(socket);
        this.socket = undefined;
        if (wasConnecting) {
          this.target = undefined;
          this.tokenExpiresAt = undefined;
        }
        this.setState("disconnected");
        if (wasConnecting) {
          rejectPending?.(
            new Error(`WebSocket closed during bridge pair (${event.code ?? "unknown"})`),
          );
        }
      };

      socket.onerror = () => {
        if (this.socket === socket && this.state === "connecting") {
          this.setState("disconnected");
          this.stopHeartbeat();
          this.target = undefined;
          this.tokenExpiresAt = undefined;
          this.disconnectSocketOnly(new Error("WebSocket error during bridge pair"));
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
    this.disconnectSocketOnly(new Error("Bridge pair attempt cancelled"));
  }

  /** Subscribe to incoming envelopes. Returns unsubscribe. */
  onMessage(handler: (envelope: ProtocolEnvelope) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
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
    this.send("snapshot.push", buildSnapshotPushPayload(input), input.tabId);
  }

  clearTab(input: { readonly tabId: string; readonly sessionId?: string }): void {
    this.send("projection.tab.closed", buildProjectionTabClosedPayload(input), input.tabId);
  }

  focusTab(input: { readonly tabId: string; readonly sessionId?: string }): void {
    this.send("projection.tab.focused", buildProjectionTabFocusedPayload(input), input.tabId);
  }

  /** Acknowledge a command.enqueue from MCP. */
  ackCommand(input: {
    readonly commandId: string;
    readonly ok: boolean;
    readonly reason?: string;
    readonly tabId?: string;
  }): void {
    this.send("command.ack", buildCommandAckPayload(input), input.tabId);
  }

  pushVerificationResult(input: {
    readonly tabId: string;
    readonly sessionId?: string;
    readonly ts: number;
    readonly passed: boolean;
    readonly details: unknown;
    readonly commandId?: string;
  }): void {
    this.send("verification.result", buildVerificationResultPayload(input), input.tabId);
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
    return this.target === undefined ? undefined : endpointFromTarget(this.target);
  }

  isInMemoryTokenValid(now: number = this.now()): boolean {
    const token = this.getInMemoryToken();
    return (
      token !== undefined &&
      token.length > 0 &&
      (this.tokenExpiresAt === undefined || now < this.tokenExpiresAt)
    );
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

  private disconnectSocketOnly(reason: Error): void {
    const socket = this.socket;
    if (socket !== undefined) {
      this.clearSocketHandlers(socket);
      socket.close(1000, "client disconnect");
      this.socket = undefined;
    }
    const rejectPending = this.pendingConnectReject;
    this.pendingConnectReject = undefined;
    rejectPending?.(reason);
  }

  private clearSocketHandlers(socket: WebSocketLike): void {
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;
    socket.onopen = null;
  }

  private setState(state: BridgeConnectionState): void {
    this.state = state;
    this.onStateChange?.(state);
  }

  private handleMessage(ev: { readonly data: string }): void {
    const envelope = parseIncoming(ev.data);
    if (envelope === undefined) return;
    for (const handler of this.messageHandlers) {
      handler(envelope);
    }
  }
}

export type { WebSocketFactory, WebSocketLike } from "./websocket.js";
