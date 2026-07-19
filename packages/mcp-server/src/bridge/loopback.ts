/**
 * Loopback-only bind guard for the MCP bridge (ADR-020, ADR-013).
 * Never bind 0.0.0.0 or a public interface.
 */

import { DEFAULT_BRIDGE_HOST } from "./constants.js";

export class NonLoopbackHostError extends Error {
  constructor(public readonly host: string) {
    super(
      `Refusing to bind MCP bridge to "${host}". ADR-020 requires exactly ` +
        `"${DEFAULT_BRIDGE_HOST}"; hostnames, IPv6, wildcard, and non-loopback values are unsupported.`,
    );
    this.name = "NonLoopbackHostError";
  }
}

/** True only for the product-approved bridge bind literal. */
export function isLoopbackHost(host: string): boolean {
  return host === DEFAULT_BRIDGE_HOST;
}

/** Throws {@link NonLoopbackHostError} when `host` differs from the approved bind literal. */
export function validateLoopbackHost(host: string): void {
  if (!isLoopbackHost(host)) {
    throw new NonLoopbackHostError(host);
  }
}
