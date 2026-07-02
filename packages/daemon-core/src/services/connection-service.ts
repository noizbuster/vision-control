import type { Logger } from "@vision-control/logger";
import type { WebSocket } from "ws";

/** A tracked live WebSocket connection, pinned to exactly one session. */
export interface ConnectionRecord {
  readonly sessionId: string;
  readonly socket: WebSocket;
  readonly connectedAt: number;
}

/**
 * Tracks active WebSocket connections and enforces one session per connection.
 * The daemon registers a connection after a successful upgrade; unregistering
 * on `close` lets reconnects re-register cleanly.
 */
export class ConnectionService {
  private readonly connections = new Map<WebSocket, ConnectionRecord>();

  constructor(private readonly logger: Logger) {}

  /** Register a socket as belonging to `sessionId`. Re-registering the same socket is a no-op. */
  register(socket: WebSocket, sessionId: string, connectedAt = Date.now()): void {
    if (this.connections.has(socket)) {
      this.logger.warn("Connection already registered; ignoring duplicate register", { sessionId });
      return;
    }
    this.connections.set(socket, { sessionId, socket, connectedAt });
  }

  unregister(socket: WebSocket): void {
    this.connections.delete(socket);
  }

  getBySocket(socket: WebSocket): ConnectionRecord | undefined {
    return this.connections.get(socket);
  }

  /** Number of currently tracked connections. */
  get size(): number {
    return this.connections.size;
  }

  /** Close every tracked connection. Used on daemon shutdown. */
  closeAll(code = 1001, reason = "daemon shutdown"): void {
    for (const socket of this.connections.keys()) {
      socket.close(code, reason);
    }
  }
}
