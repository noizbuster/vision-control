import { z } from "zod";

import {
  BRIDGE_WS_PATH,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  PAIRING_PROTOCOL,
} from "./constants.js";
import type { DiscoverResponse } from "./discover.js";
import { defaultDiscoverResponse } from "./discover.js";
import { isLoopbackHost } from "./loopback.js";

export const BridgeTargetSchema = z.object({
  token: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive(),
  wsPath: z.string().min(1),
});

export type BridgeTarget = z.infer<typeof BridgeTargetSchema>;

export type BridgePairingResult =
  | { readonly success: true; readonly target: BridgeTarget }
  | { readonly success: false; readonly reason: string };

/**
 * Resolve a pasted pair token or `vision-control://pair?...` URL into a
 * loopback bridge target. Bare tokens use discover defaults (port 4322).
 */
export function resolveBridgePairingInput(
  input: string,
  discover: DiscoverResponse = defaultDiscoverResponse(),
): BridgePairingResult {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { success: false, reason: "empty pairing input" };
  }
  const trimmed = input.trim();

  if (looksLikeBareToken(trimmed)) {
    return buildTarget({
      token: trimmed,
      host: discover.host,
      port: discover.port,
      wsPath: discover.wsPath,
    });
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { success: false, reason: "not a valid URL" };
  }

  if (parsed.protocol !== PAIRING_PROTOCOL) {
    return {
      success: false,
      reason: `unsupported scheme "${parsed.protocol}" (expected "${PAIRING_PROTOCOL}")`,
    };
  }

  const token = parsed.searchParams.get("token");
  if (token === null || token.length === 0) {
    return { success: false, reason: "missing or empty token query parameter" };
  }

  const portParam = parsed.searchParams.get("port");
  const hostFromQuery = parsed.searchParams.get("host");
  const hostParam =
    hostFromQuery !== null && hostFromQuery.length > 0
      ? hostFromQuery
      : parsed.hostname.length > 0
        ? parsed.hostname
        : discover.host;
  const port = portParam === null ? discover.port : Number.parseInt(portParam, 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    return { success: false, reason: `invalid port "${portParam ?? ""}"` };
  }
  if (hostParam.length === 0) {
    return { success: false, reason: "missing host" };
  }

  const wsPath = parsed.searchParams.get("wsPath") ?? discover.wsPath ?? BRIDGE_WS_PATH;

  return buildTarget({ token, host: hostParam, port, wsPath });
}

/** Build the authenticated bridge WebSocket URL (`/bridge?token=…`). */
export function toBridgeWebSocketUrl(target: BridgeTarget, secure = false): string {
  const scheme = secure ? "wss" : "ws";
  const path = target.wsPath.startsWith("/") ? target.wsPath : `/${target.wsPath}`;
  return `${scheme}://${target.host}:${target.port}${path}?token=${encodeURIComponent(target.token)}`;
}

/** Synthesize a `vision-control://pair?...` URL for bare-token panel paste. */
export function synthesizeBridgePairingUrl(
  token: string,
  host: string = DEFAULT_BRIDGE_HOST,
  port: number = DEFAULT_BRIDGE_PORT,
): string {
  const params = new URLSearchParams({
    token,
    port: String(port),
    host,
  });
  return `${PAIRING_PROTOCOL}//pair?${params.toString()}`;
}

function looksLikeBareToken(input: string): boolean {
  return input.length > 0 && !input.includes("://") && !input.includes("/");
}

function buildTarget(input: {
  readonly token: string;
  readonly host: string;
  readonly port: number;
  readonly wsPath: string;
}): BridgePairingResult {
  if (!isLoopbackHost(input.host)) {
    return {
      success: false,
      reason: `host "${input.host}" is not loopback; refusing pair`,
    };
  }
  const result = BridgeTargetSchema.safeParse(input);
  if (!result.success) {
    return { success: false, reason: "validation failed" };
  }
  return { success: true, target: result.data };
}
