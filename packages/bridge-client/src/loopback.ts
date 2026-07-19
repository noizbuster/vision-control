import { BRIDGE_WS_PATH, DEFAULT_BRIDGE_HOST, DEFAULT_BRIDGE_PORT } from "./constants.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const normalizeHostname = (hostname: string): string =>
  hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

/** True when `host` is an exact loopback name/address. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeHostname(host));
}

export class NonLoopbackHostError extends Error {
  constructor(public readonly host: string) {
    super(
      `Refusing MCP bridge host "${host}". ADR-020 requires exactly ` +
        `"${DEFAULT_BRIDGE_HOST}"; hostnames, IPv6, wildcard, and non-loopback values are unsupported.`,
    );
    this.name = "NonLoopbackHostError";
  }
}

export class BridgePortPolicyError extends Error {
  constructor(public readonly port: number | string) {
    super(
      `Refusing MCP bridge port "${port}". ADR-020 requires exactly ` +
        `"${DEFAULT_BRIDGE_HOST}:${DEFAULT_BRIDGE_PORT}"; alternate ports are unsupported.`,
    );
    this.name = "BridgePortPolicyError";
  }
}

export class BridgePathPolicyError extends Error {
  constructor(public readonly path: string) {
    super(
      `Refusing MCP bridge path "${path}". ADR-020 requires exactly bridge path "${BRIDGE_WS_PATH}".`,
    );
    this.name = "BridgePathPolicyError";
  }
}

export function isApprovedBridgeHost(host: string): boolean {
  return host === DEFAULT_BRIDGE_HOST;
}

export function isApprovedBridgePort(port: number): boolean {
  return port === DEFAULT_BRIDGE_PORT;
}

export function isApprovedBridgePath(path: string): boolean {
  return path === BRIDGE_WS_PATH;
}

export function hasApprovedBridgeUrlAuthority(input: string): boolean {
  const schemeEnd = input.indexOf("://");
  if (schemeEnd === -1) {
    return false;
  }
  const authorityAndPath = input.slice(schemeEnd + 3);
  const authorityEnd = authorityAndPath.search(/[/?#]/);
  const authority =
    authorityEnd === -1 ? authorityAndPath : authorityAndPath.slice(0, authorityEnd);
  return authority === `${DEFAULT_BRIDGE_HOST}:${DEFAULT_BRIDGE_PORT}`;
}

/** Throws {@link NonLoopbackHostError} unless `host` is exactly the approved bridge literal. */
export function assertLoopbackHost(host: string): void {
  if (!isApprovedBridgeHost(host)) {
    throw new NonLoopbackHostError(host);
  }
}

export function assertBridgeEndpoint(
  host: string,
  port: number,
  path: string = BRIDGE_WS_PATH,
): void {
  assertLoopbackHost(host);
  if (!isApprovedBridgePort(port)) {
    throw new BridgePortPolicyError(port);
  }
  if (!isApprovedBridgePath(path)) {
    throw new BridgePathPolicyError(path);
  }
}
