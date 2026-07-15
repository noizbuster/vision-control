/**
 * Loopback-only bind guard for the MCP bridge (ADR-020, ADR-013).
 * Never bind 0.0.0.0 or a public interface.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export class NonLoopbackHostError extends Error {
  constructor(public readonly host: string) {
    super(
      `Refusing to bind MCP bridge to "${host}". Loopback only (ADR-020). ` +
        `Use 127.0.0.1, ::1, or localhost. Binding 0.0.0.0 would expose the bridge.`,
    );
    this.name = "NonLoopbackHostError";
  }
}

/** True when `host` is an exact loopback name/address. */
export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host);
}

/** Throws {@link NonLoopbackHostError} when `host` is not loopback. */
export function validateLoopbackHost(host: string): void {
  if (!isLoopbackHost(host)) {
    throw new NonLoopbackHostError(host);
  }
}
