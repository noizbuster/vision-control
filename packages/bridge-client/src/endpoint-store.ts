import { z } from "zod";

import { BRIDGE_ENDPOINT_STORAGE_KEY, BRIDGE_WS_PATH } from "./constants.js";
import {
  assertBridgeEndpoint,
  isApprovedBridgeHost,
  isApprovedBridgePath,
  isApprovedBridgePort,
} from "./loopback.js";
import type { BridgeTarget } from "./pairing.js";
import { isUnknownRecord } from "./record.js";

const FORBIDDEN_ENDPOINT_KEYS = [
  "token",
  "pairToken",
  "pairingToken",
  "secret",
  "mcpToken",
  "authorization",
  "password",
] as const;

/**
 * Persisted bridge endpoint. Must never include the raw pair token
 * (ADR-020 C3 — store endpoint only).
 */
export const BridgeEndpointSchema = z
  .object({
    host: z.string().min(1).refine(isApprovedBridgeHost),
    port: z.number().int().positive().refine(isApprovedBridgePort),
    wsPath: z.string().min(1).refine(isApprovedBridgePath),
    protocolVersion: z.string().min(1).optional(),
  })
  .strict();

export type BridgeEndpoint = z.infer<typeof BridgeEndpointSchema>;

export { BRIDGE_ENDPOINT_STORAGE_KEY };

/** Extract the durable endpoint from a successful pair target. */
export function endpointFromTarget(target: BridgeTarget, protocolVersion?: string): BridgeEndpoint {
  assertBridgeEndpoint(target.host, target.port, target.wsPath);
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
  if (!isUnknownRecord(raw)) {
    return undefined;
  }
  if (FORBIDDEN_ENDPOINT_KEYS.some((key) => key in raw)) {
    return undefined;
  }
  const parsed = BridgeEndpointSchema.safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data;
}

/** True when a storage payload is safe (no secret fields). */
export function isEndpointPayloadSecretFree(raw: unknown): boolean {
  return BridgeEndpointSchema.safeParse(raw).success;
}
