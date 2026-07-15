export const PACKAGE_NAME = "@vision-control/bridge-client";

export { ActiveSessionTracker } from "./active-session.js";
export {
  BridgeClient,
  type BridgeClientOptions,
  type BridgeConnectionState,
  type TimerHandle,
  type WebSocketFactory,
  type WebSocketLike,
} from "./client.js";
export {
  BRIDGE_ENDPOINT_STORAGE_KEY,
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_WS_PATH,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  DISCOVER_PATH,
  HEARTBEAT_INTERVAL_MS,
  PAIR_TOKEN_TTL_MS,
  PAIRING_PAIR_PATH,
  PAIRING_PROTOCOL,
} from "./constants.js";
export {
  type DiscoverProbeResult,
  type DiscoverResponse,
  DiscoverResponseSchema,
  defaultDiscoverBaseUrl,
  defaultDiscoverResponse,
  FORBIDDEN_DISCOVER_KEYS,
  type ProbeDiscoverOptions,
  parseDiscoverResponse,
  probeDiscover,
} from "./discover.js";
export {
  type BridgeEndpoint,
  BridgeEndpointSchema,
  endpointFromTarget,
  isEndpointPayloadSecretFree,
  parseStoredEndpoint,
} from "./endpoint-store.js";
export {
  assertLoopbackHost,
  isLoopbackHost,
  NonLoopbackHostError,
} from "./loopback.js";
export {
  type BuildEnvelopeOptions,
  buildCommandAckPayload,
  buildHeartbeatPayload,
  buildSnapshotPushPayload,
  buildVerificationResultPayload,
  wrapBridgeEnvelope,
} from "./messages.js";
export {
  type BridgePairingResult,
  type BridgeTarget,
  BridgeTargetSchema,
  resolveBridgePairingInput,
  type SynthesizePairingUrlResult,
  synthesizeBridgePairingUrl,
  synthesizePairingUrlFromHttpPairPage,
  toBridgeWebSocketUrl,
} from "./pairing.js";
export {
  decideSwWakeReconnect,
  type SwWakeDecision,
  type SwWakeInput,
} from "./reconnect-policy.js";
