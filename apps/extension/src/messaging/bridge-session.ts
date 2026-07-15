import {
  ActiveSessionTracker,
  BRIDGE_ENDPOINT_STORAGE_KEY,
  type BridgeClient,
  type BridgeConnectionState,
  type BridgeEndpoint,
  decideSwWakeReconnect,
  parseStoredEndpoint,
  type SwWakeDecision,
} from "@vision-control/bridge-client";

import type { ConnectionState } from "./types.js";

export type BridgeStorageArea = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

export function connectionStateFromBridge(state: BridgeConnectionState): ConnectionState {
  return state;
}

export async function persistBridgeEndpoint(
  storage: BridgeStorageArea | undefined,
  endpoint: BridgeEndpoint,
): Promise<void> {
  if (storage === undefined) {
    return;
  }
  await storage.set({ [BRIDGE_ENDPOINT_STORAGE_KEY]: endpoint });
}

export async function loadBridgeEndpoint(
  storage: BridgeStorageArea | undefined,
): Promise<BridgeEndpoint | undefined> {
  if (storage === undefined) {
    return undefined;
  }
  const stored = await storage.get(BRIDGE_ENDPOINT_STORAGE_KEY);
  return parseStoredEndpoint(stored[BRIDGE_ENDPOINT_STORAGE_KEY]);
}

export async function clearBridgeEndpoint(storage: BridgeStorageArea | undefined): Promise<void> {
  if (storage === undefined) {
    return;
  }
  await storage.remove(BRIDGE_ENDPOINT_STORAGE_KEY);
}

export function evaluateSwWake(
  client: BridgeClient | undefined,
  endpoint: BridgeEndpoint | undefined,
  now: number = Date.now(),
): SwWakeDecision {
  return decideSwWakeReconnect({
    endpoint,
    inMemoryToken: client?.getInMemoryToken(),
    tokenExpiresAt: client?.getTokenExpiresAt(),
    now,
  });
}

export { ActiveSessionTracker, BRIDGE_ENDPOINT_STORAGE_KEY };
