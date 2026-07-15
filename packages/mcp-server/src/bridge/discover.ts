/**
 * `GET /discover` response builder (ADR-020 C3).
 *
 * Shape is fixed and secret-free: no pair token, no agent bearer, no session id.
 */

import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_WS_PATH,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
} from "./constants.js";

/** Discover JSON — never includes a token field. */
export interface DiscoverResponse {
  readonly host: string;
  readonly port: number;
  readonly wsPath: string;
  readonly pairTokenRequired: true;
  readonly protocolVersion: string;
}

export interface BuildDiscoverResponseInput {
  readonly host?: string;
  readonly port?: number;
  readonly wsPath?: string;
  readonly protocolVersion?: string;
}

/** Build the public discover payload (no secrets). */
export function buildDiscoverResponse(input: BuildDiscoverResponseInput = {}): DiscoverResponse {
  return {
    host: input.host ?? DEFAULT_BRIDGE_HOST,
    port: input.port ?? DEFAULT_BRIDGE_PORT,
    wsPath: input.wsPath ?? BRIDGE_WS_PATH,
    pairTokenRequired: true,
    protocolVersion: input.protocolVersion ?? BRIDGE_PROTOCOL_VERSION,
  };
}

/** Keys that must never appear on discover JSON (secret leakage guard). */
export const FORBIDDEN_DISCOVER_KEYS = [
  "token",
  "pairToken",
  "pairingToken",
  "secret",
  "mcpToken",
  "authorization",
] as const;
