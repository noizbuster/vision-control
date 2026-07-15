const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

const normalizeHostname = (hostname: string): string =>
  hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

/** True when `host` is an exact loopback name/address. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(normalizeHostname(host));
}

export class NonLoopbackHostError extends Error {
  constructor(public readonly host: string) {
    super(`Refusing non-loopback host "${host}". MCP bridge is loopback-only (ADR-020).`);
    this.name = "NonLoopbackHostError";
  }
}

/** Throws {@link NonLoopbackHostError} when `host` is not loopback. */
export function assertLoopbackHost(host: string): void {
  if (!isLoopbackHost(host)) {
    throw new NonLoopbackHostError(host);
  }
}
