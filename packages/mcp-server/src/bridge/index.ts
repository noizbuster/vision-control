/**
 * MCP bridge surface: discover + pair WS on loopback 4322 (ADR-020 C2/C3)
 * plus projection cache / command queue (ADR-020 snapshot push + C5).
 */

export {
  BridgePortInUseError,
  type BridgeServerHandle,
  type BridgeServerOptions,
  NonLoopbackHostError,
  startBridgeServer,
} from "./bridge-server.js";
export {
  type BridgeSession,
  type BridgeSessionOptions,
  createBridgeSession,
  minimalSnapshot,
} from "./bridge-session.js";
export {
  type CommandQueue,
  createCommandQueue,
  type EnqueueCommandInput,
  type QueuedCommand,
} from "./command-queue.js";
export {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_WS_PATH,
  DEFAULT_BRIDGE_HOST,
  DEFAULT_BRIDGE_PORT,
  DISCOVER_PATH,
  PAIR_TOKEN_TTL_MS,
} from "./constants.js";
export {
  type BuildDiscoverResponseInput,
  buildDiscoverResponse,
  type DiscoverResponse,
  FORBIDDEN_DISCOVER_KEYS,
} from "./discover.js";
export { isLoopbackHost, validateLoopbackHost } from "./loopback.js";
export {
  constantTimeEquals,
  formatPairingStderrLines,
  type MintPairTokenOptions,
  mintPairToken,
  type PairTokenState,
  type PairTokenValidation,
  printPairingToStderr,
  validatePairToken,
} from "./pair-token.js";
export {
  createProjectionCache,
  HEARTBEAT_MAX_GAP_MS,
  type ProjectionCache,
  type ProjectionCacheState,
  type ProjectionEntry,
} from "./projection-cache.js";
export {
  createProjectionDeps,
  type ProjectionCommandPayload,
  type ProjectionDepsOptions,
} from "./projection-deps.js";
