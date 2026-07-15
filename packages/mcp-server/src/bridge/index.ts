/**
 * MCP bridge surface: discover + pair WS on loopback 4322 (ADR-020 C2/C3).
 */

export {
  BridgePortInUseError,
  type BridgeServerHandle,
  type BridgeServerOptions,
  NonLoopbackHostError,
  startBridgeServer,
} from "./bridge-server.js";
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
