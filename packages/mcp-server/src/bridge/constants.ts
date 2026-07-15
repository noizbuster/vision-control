/**
 * Fixed bridge endpoints for the single-process MCP binary (ADR-020 C2/C3).
 *
 * Port 4322 is product-locked. Busy port fails with a clear error — no multi-port
 * scan. Discover never carries secrets; pair material is stderr-only.
 */

/** Loopback discovery + bridge port (ADR-020 C2). */
export const DEFAULT_BRIDGE_PORT = 4322;

/** Default bind host — loopback only. */
export const DEFAULT_BRIDGE_HOST = "127.0.0.1";

/** Unauthenticated discovery path. */
export const DISCOVER_PATH = "/discover";

/** WebSocket pair + bridge path on the same port. */
export const BRIDGE_WS_PATH = "/bridge";

/**
 * Bridge protocol version advertised on `/discover`.
 * Matches `@vision-control/protocol` major product protocol (2.0.0).
 */
export const BRIDGE_PROTOCOL_VERSION = "2.0.0";

/** Pair-token lifetime: 5 minutes (ADR-020 C3). */
export const PAIR_TOKEN_TTL_MS = 5 * 60 * 1000;
