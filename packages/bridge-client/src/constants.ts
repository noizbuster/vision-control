/** Fixed product bridge port (ADR-020 C2). */
export const DEFAULT_BRIDGE_PORT = 4322;

/** Default loopback host for discover + pair. */
export const DEFAULT_BRIDGE_HOST = "127.0.0.1";

/** Unauthenticated discovery path. */
export const DISCOVER_PATH = "/discover";

/** WebSocket pair + bridge path. */
export const BRIDGE_WS_PATH = "/bridge";

/** Bridge protocol version expected from discover. */
export const BRIDGE_PROTOCOL_VERSION = "2.0.0";

/** Pair-token lifetime assumed client-side after successful pair (ADR-020 C3). */
export const PAIR_TOKEN_TTL_MS = 5 * 60 * 1000;

/**
 * Client heartbeat interval. MCP disconnects after 15s without
 * `session.heartbeat` (ADR-019 C8 / ADR-020).
 */
export const HEARTBEAT_INTERVAL_MS = 5_000;

/** chrome.storage.local key for the persisted bridge endpoint (no token). */
export const BRIDGE_ENDPOINT_STORAGE_KEY = "vc.bridge.endpoint";

export const PAIRING_PROTOCOL = "vision-control:";
export const PAIRING_PAIR_PATH = "/pair";
