import type { BoundaryKind, OwnershipContext } from "@vision-control/source-resolver";

import type { BusMessage } from "./types.js";

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

/**
 * Panel → background signal carrying the daemon pairing URL. The background
 * re-parses this with {@link parsePairingUrl} and drives the ReconnectManager;
 * the panel never talks to the daemon directly.
 */
export interface DaemonConnectPayload {
  readonly pairingUrl: string;
}

export function createDaemonConnectMessage(pairingUrl: string): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `daemon-connect-${Date.now()}`,
    messageType: "daemon-connect",
    targetRoute: "background",
    payload: { pairingUrl } satisfies DaemonConnectPayload,
    timestamp: Date.now(),
  };
}

export function createDaemonDisconnectMessage(): BusMessage {
  return {
    protocolVersion: "1.0.0",
    messageId: `daemon-disconnect-${Date.now()}`,
    messageType: "daemon-disconnect",
    targetRoute: "background",
    payload: {},
    timestamp: Date.now(),
  };
}
