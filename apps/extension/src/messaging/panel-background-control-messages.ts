import type { BusMessage } from "./types.js";

/** Local ownership context for component-props request payloads. */
export type OwnershipContext = "same-component" | "reparented-or-moved" | "cross-boundary";

/** Local boundary kind for component-props request payloads. */
export type BoundaryKind = "server-to-client" | "client-to-server" | "context-provider" | "none";

export function createHostAccessChangedMessage(): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `host-access-changed-${Date.now()}`,
    messageType: "host-access-changed",
    targetRoute: "background",
    payload: {},
    timestamp: Date.now(),
  };
}

/**
 * Selection identity the panel sends to the background to request daemon-side
 * prop discovery. The background forwards this to the daemon source-resolver
 * (the `discoverProps`/`propFlowWarnings` functions are platform:node and must
 * not run in the browser — symmetric `browser-imports-node` rule from task 1).
 */
export interface RequestComponentPropsPayload {
  readonly elementId: string;
  readonly tagName: string;
  readonly sourceId?: string;
  readonly componentName?: string;
  readonly ownershipContext?: OwnershipContext;
  readonly boundary?: BoundaryKind;
}

export function createRequestComponentPropsMessage(
  payload: RequestComponentPropsPayload,
): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `request-component-props-${Date.now()}`,
    messageType: "request-component-props",
    targetRoute: "background",
    payload,
    timestamp: Date.now(),
  };
}

export interface BridgeConnectPayload {
  readonly pairingUrl: string;
}

export type DaemonConnectPayload = BridgeConnectPayload;

export const BRIDGE_CONNECT_MESSAGE_TYPE: "bridge-connect" = "bridge-connect";
export const BRIDGE_DISCONNECT_MESSAGE_TYPE: "bridge-disconnect" = "bridge-disconnect";
export const DAEMON_CONNECT_MESSAGE_TYPE: "daemon-connect" = "daemon-connect";
export const DAEMON_DISCONNECT_MESSAGE_TYPE: "daemon-disconnect" = "daemon-disconnect";

export type BridgeConnectMessageType = "bridge-connect" | "daemon-connect";
export type BridgeDisconnectMessageType = "bridge-disconnect" | "daemon-disconnect";

export const BRIDGE_CONNECT_MESSAGE_TYPES: readonly BridgeConnectMessageType[] = [
  BRIDGE_CONNECT_MESSAGE_TYPE,
  DAEMON_CONNECT_MESSAGE_TYPE,
];

export const BRIDGE_DISCONNECT_MESSAGE_TYPES: readonly BridgeDisconnectMessageType[] = [
  BRIDGE_DISCONNECT_MESSAGE_TYPE,
  DAEMON_DISCONNECT_MESSAGE_TYPE,
];

export function isBridgeConnectMessageType(messageType: string): boolean {
  return messageType === BRIDGE_CONNECT_MESSAGE_TYPE || messageType === DAEMON_CONNECT_MESSAGE_TYPE;
}

export function isBridgeDisconnectMessageType(messageType: string): boolean {
  return (
    messageType === BRIDGE_DISCONNECT_MESSAGE_TYPE || messageType === DAEMON_DISCONNECT_MESSAGE_TYPE
  );
}

function createConnectMessage(
  messageType: BridgeConnectMessageType,
  pairingUrl: string,
  tabId?: number,
): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `${messageType}-${Date.now()}`,
    messageType,
    targetRoute: "background",
    ...(tabId !== undefined ? { tabId } : {}),
    payload: { pairingUrl } satisfies BridgeConnectPayload,
    timestamp: Date.now(),
  };
}

function createDisconnectMessage(
  messageType: BridgeDisconnectMessageType,
  tabId?: number,
): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `${messageType}-${Date.now()}`,
    messageType,
    targetRoute: "background",
    ...(tabId !== undefined ? { tabId } : {}),
    payload: {},
    timestamp: Date.now(),
  };
}

export function createBridgeConnectMessage(pairingUrl: string, tabId?: number): BusMessage {
  return createConnectMessage(BRIDGE_CONNECT_MESSAGE_TYPE, pairingUrl, tabId);
}

export function createBridgeDisconnectMessage(tabId?: number): BusMessage {
  return createDisconnectMessage(BRIDGE_DISCONNECT_MESSAGE_TYPE, tabId);
}

export function createDaemonConnectMessage(pairingUrl: string): BusMessage {
  return createConnectMessage(DAEMON_CONNECT_MESSAGE_TYPE, pairingUrl);
}

export function createDaemonDisconnectMessage(): BusMessage {
  return createDisconnectMessage(DAEMON_DISCONNECT_MESSAGE_TYPE);
}
