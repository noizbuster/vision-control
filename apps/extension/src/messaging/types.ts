/**
 * Typed internal message bus for the Vision Control extension.
 *
 * These types are intentionally separate from {@link @vision-control/protocol#ProtocolEnvelope}:
 * the bus carries Chrome-internal identity (`tabId`, `frameId` as numbers) while the
 * daemon-bound protocol envelope serialises those as strings for wire portability.
 */

export type BusRoute = "panel" | "devtools" | "background" | "content" | "daemon";

export type BusMessage = {
  readonly protocolVersion: string;
  readonly messageId: string;
  readonly messageType: string;
  readonly tabId?: number;
  readonly frameId?: number;
  readonly sessionId?: string;
  readonly selectionRevision?: number;
  readonly sourceRoute?: BusRoute;
  readonly targetRoute?: BusRoute;
  readonly payload: unknown;
  readonly timestamp: number;
};

export type MessageContext = {
  readonly route: BusRoute | "unknown";
  readonly tabId?: number | undefined;
  readonly frameId?: number | undefined;
  readonly sessionId?: string | undefined;
};

export type BusMessageHandler = (
  message: BusMessage,
  context: MessageContext,
) => void | Promise<void>;

export type FrameInfo = {
  readonly frameId: number;
  readonly parentFrameId?: number | undefined;
  readonly url: string;
  readonly origin: string;
  readonly routeable: boolean;
};

export type TabSession = {
  readonly sessionId: string;
  readonly inspected: boolean;
  readonly frameTree: readonly FrameInfo[];
};

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";
