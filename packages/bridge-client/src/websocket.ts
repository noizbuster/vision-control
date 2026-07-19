export interface WebSocketLike {
  readonly readyState: number;
  readonly OPEN: number;
  close(code?: number, reason?: string): void;
  send(data: string): void;
  onopen: ((this: WebSocketLike) => void) | null;
  onmessage: ((this: WebSocketLike, event: { readonly data: string }) => void) | null;
  onclose:
    | ((this: WebSocketLike, event: { readonly code?: number; readonly reason?: string }) => void)
    | null;
  onerror: ((this: WebSocketLike) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

class NativeWebSocketAdapter implements WebSocketLike {
  readonly OPEN = globalThis.WebSocket.OPEN;
  onopen: ((this: WebSocketLike) => void) | null = null;
  onmessage: ((this: WebSocketLike, event: { readonly data: string }) => void) | null = null;
  onclose:
    | ((this: WebSocketLike, event: { readonly code?: number; readonly reason?: string }) => void)
    | null = null;
  onerror: ((this: WebSocketLike) => void) | null = null;
  private readonly socket: WebSocket;

  constructor(url: string) {
    this.socket = new globalThis.WebSocket(url);
    this.socket.addEventListener("open", () => this.onopen?.call(this));
    this.socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") {
        this.onmessage?.call(this, { data: event.data });
      }
    });
    this.socket.addEventListener("close", (event) => {
      this.onclose?.call(this, { code: event.code, reason: event.reason });
    });
    this.socket.addEventListener("error", () => this.onerror?.call(this));
  }

  get readyState(): number {
    return this.socket.readyState;
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  send(data: string): void {
    this.socket.send(data);
  }
}

export function createNativeWebSocket(url: string): WebSocketLike {
  return new NativeWebSocketAdapter(url);
}
