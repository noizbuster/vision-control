export const PACKAGE_NAME = "@vision-control/daemon-client";

export {
  type BackoffOptions,
  type ConnectionState,
  computeBackoffDelay,
  DaemonClient,
  type DaemonClientOptions,
  type TimerHandle,
  type WebSocketFactory,
  type WebSocketLike,
} from "./client.js";
export {
  PAIRING_PAIR_PATH,
  PAIRING_PROTOCOL,
  type PairingParseResult,
  type PairingTarget,
  PairingTargetSchema,
  parsePairingUrl,
  toWebSocketUrl,
} from "./pairing.js";
