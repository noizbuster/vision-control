import { z } from "zod";

import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_WS_PATH,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  DISCOVER_PATH,
} from "./constants.js";
import {
  BridgePortPolicyError,
  hasApprovedBridgeUrlAuthority,
  isApprovedBridgeHost,
  isApprovedBridgePath,
  isApprovedBridgePort,
  NonLoopbackHostError,
} from "./loopback.js";
import { isUnknownRecord } from "./record.js";

/** Discover JSON — never includes a token field (ADR-020 C3). */
export const DiscoverResponseSchema = z
  .object({
    host: z.string().min(1).refine(isApprovedBridgeHost),
    port: z.number().int().positive().refine(isApprovedBridgePort),
    wsPath: z.string().min(1).refine(isApprovedBridgePath),
    pairTokenRequired: z.literal(true),
    protocolVersion: z.string().min(1),
  })
  .strict();

export type DiscoverResponse = z.infer<typeof DiscoverResponseSchema>;

export type DiscoverProbeResult =
  | { readonly success: true; readonly discover: DiscoverResponse }
  | { readonly success: false; readonly reason: string };

export type ProbeDiscoverOptions = {
  readonly fetchImpl?: typeof fetch;
  /** Override base URL. Must be loopback. Default `http://127.0.0.1:4322`. */
  readonly baseUrl?: string;
  readonly signal?: AbortSignal;
};

/** Keys that must never appear on discover JSON. */
export const FORBIDDEN_DISCOVER_KEYS = [
  "token",
  "pairToken",
  "pairingToken",
  "secret",
  "mcpToken",
  "authorization",
] as const;

export function defaultDiscoverBaseUrl(): string {
  return `http://${DEFAULT_BRIDGE_HOST}:${DEFAULT_BRIDGE_PORT}`;
}

/**
 * Probe `GET {base}/discover` only. Refuses non-loopback bases.
 * Does not expect or accept secrets in the response body.
 */
export async function probeDiscover(
  options: ProbeDiscoverOptions = {},
): Promise<DiscoverProbeResult> {
  const baseUrl = options.baseUrl ?? defaultDiscoverBaseUrl();
  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return { success: false, reason: "invalid discover base URL" };
  }
  if (parsedBase.protocol !== "http:" && parsedBase.protocol !== "https:") {
    return { success: false, reason: `unsupported scheme "${parsedBase.protocol}"` };
  }
  if (!isApprovedBridgeHost(parsedBase.hostname)) {
    return {
      success: false,
      reason: new NonLoopbackHostError(baseUrl).message,
    };
  }
  if (!hasApprovedBridgeUrlAuthority(baseUrl)) {
    return {
      success: false,
      reason: new BridgePortPolicyError(parsedBase.port).message,
    };
  }
  if (parsedBase.pathname !== "/" || parsedBase.search.length > 0 || parsedBase.hash.length > 0) {
    return { success: false, reason: "discover base URL must contain only the approved authority" };
  }

  const url = new URL(DISCOVER_PATH, parsedBase);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const init: RequestInit = {
    method: "GET",
    headers: { accept: "application/json" },
  };
  if (options.signal !== undefined) {
    init.signal = options.signal;
  }
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), init);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return { success: false, reason: `discover probe failed: ${message}` };
  }

  if (!response.ok) {
    return { success: false, reason: `discover HTTP ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { success: false, reason: "discover response is not JSON" };
  }

  return parseDiscoverResponse(body);
}

/** Parse and validate a discover JSON body (secret-free). */
export function parseDiscoverResponse(body: unknown): DiscoverProbeResult {
  if (!isUnknownRecord(body)) {
    return { success: false, reason: "discover body is not an object" };
  }
  for (const key of FORBIDDEN_DISCOVER_KEYS) {
    if (key in body) {
      return { success: false, reason: `discover body contains forbidden key "${key}"` };
    }
  }

  const host = body.host;
  if (typeof host === "string" && !isApprovedBridgeHost(host)) {
    return { success: false, reason: new NonLoopbackHostError(host).message };
  }
  const port = body.port;
  if (typeof port === "number" && !isApprovedBridgePort(port)) {
    return { success: false, reason: new BridgePortPolicyError(port).message };
  }

  const parsed = DiscoverResponseSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, reason: "discover body failed schema validation" };
  }

  return { success: true, discover: parsed.data };
}

/** Fallback discover shape when auto-detect is skipped (bare token + defaults). */
export function defaultDiscoverResponse(): DiscoverResponse {
  return {
    host: DEFAULT_BRIDGE_HOST,
    port: DEFAULT_BRIDGE_PORT,
    wsPath: BRIDGE_WS_PATH,
    pairTokenRequired: true,
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
  };
}
