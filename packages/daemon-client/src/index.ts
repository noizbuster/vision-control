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
  buildPairingHttpUrl,
  type BuildPairingHttpUrlInput,
  type BuildPairingHttpUrlResult,
  PAIRING_HTTP_NAVIGATION_HOST,
  PAIRING_PAIR_PATH,
  PAIRING_PROTOCOL,
  type PairingParseResult,
  type PairingTarget,
  PairingTargetSchema,
  parsePairingUrl,
  type SynthesizePairingUrlResult,
  synthesizePairingUrlFromHttpPairPage,
  toWebSocketUrl,
} from "./pairing.js";
