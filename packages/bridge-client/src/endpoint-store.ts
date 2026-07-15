import { z } from "zod";

import { BRIDGE_ENDPOINT_STORAGE_KEY, BRIDGE_WS_PATH } from "./constants.js";
import { isLoopbackHost } from "./loopback.js";
import type { BridgeTarget } from "./pairing.js";

/**
 * Persisted bridge endpoint. Must never include the raw pair token
 * (ADR-020 C3 — store endpoint only).
 */
export const BridgeEndpointSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  wsPath: z.string().min(1),
  protocolVersion: z.string().min(1).optional(),
});

export type BridgeEndpoint = z.infer<typeof BridgeEndpointSchema>;

export { BRIDGE_ENDPOINT_STORAGE_KEY };

/** Extract the durable endpoint from a successful pair target. */
export function endpointFromTarget(target: BridgeTarget, protocolVersion?: string): BridgeEndpoint {
  const endpoint: BridgeEndpoint = {
    host: target.host,
    port: target.port,
    wsPath: target.wsPath.length > 0 ? target.wsPath : BRIDGE_WS_PATH,
  };
  if (protocolVersion !== undefined) {
    return { ...endpoint, protocolVersion };
  }
  return endpoint;
}

/** Parse a value loaded from chrome.storage.local. Rejects token-bearing shapes. */
export function parseStoredEndpoint(raw: unknown): BridgeEndpoint | undefined {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  if ("token" in record || "pairToken" in record || "pairingToken" in record) {
    return undefined;
  }
  const parsed = BridgeEndpointSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  if (!isLoopbackHost(parsed.data.host)) {
    return undefined;
  }
  return parsed.data;
}

/** True when a storage payload is safe (no secret fields). */
export function isEndpointPayloadSecretFree(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const record = raw as Record<string, unknown>;
  return !("token" in record || "pairToken" in record || "pairingToken" in record);
}
