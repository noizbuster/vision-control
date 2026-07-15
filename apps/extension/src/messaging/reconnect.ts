import type {
  DaemonClient,
  ConnectionState as DaemonConnectionState,
} from "@vision-control/daemon-client";
import type { ProtocolEnvelope, WelcomeMessage } from "@vision-control/protocol";
import type { ConnectionState } from "./types.js";

export type { ConnectionState };

export interface ReconnectManagerOptions {
  readonly client: DaemonClient;
  readonly onStateChange?: (state: ConnectionState) => void;
  readonly onMessage?: (envelope: ProtocolEnvelope) => void;
}

/** Optional agent/MCP bridge client wrapper with offline pending queue. */
export class ReconnectManager {
  private readonly client: DaemonClient;
  private readonly onStateChange: ((state: ConnectionState) => void) | undefined;
  private readonly onMessage: ((envelope: ProtocolEnvelope) => void) | undefined;
  private state: ConnectionState = "disconnected";
  private readonly pending: ProtocolEnvelope[] = [];
  private unsubscribeMessage: (() => void) | undefined;

  constructor(options: ReconnectManagerOptions) {
    this.client = options.client;
    this.onStateChange = options.onStateChange;
    this.onMessage = options.onMessage;
  }

  async connect(): Promise<WelcomeMessage> {
    this.setState("connecting");
    const welcome = await this.client.connect();
    this.setState("connected");
    this.unsubscribeMessage = this.client.onMessage((envelope) => {
      this.onMessage?.(envelope);
    });
    this.flushPending();
    return welcome;
  }

  disconnect(): void {
    this.unsubscribeMessage?.();
    this.unsubscribeMessage = undefined;
    this.client.disconnect();
    this.setState("disconnected");
  }

  /**
   * Send a daemon-bound envelope. If the socket is not open, the envelope is
   * queued and sent once the connection recovers.
   */
  send(envelope: ProtocolEnvelope): void {
    if (this.state === "connected" && this.client.state === "connected") {
      this.client.send(envelope.messageType, envelope.payload);
      return;
    }
    this.pending.push(envelope);
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.onStateChange?.(state);
  }

  private flushPending(): void {
    if (this.state !== "connected") {
      return;
    }
    while (this.pending.length > 0) {
      const envelope = this.pending.shift();
      if (envelope === undefined) {
        break;
      }
      this.client.send(envelope.messageType, envelope.payload);
    }
  }
}

export function connectionStateFromDaemonClient(
  clientState: DaemonConnectionState,
): ConnectionState {
  return clientState;
}
