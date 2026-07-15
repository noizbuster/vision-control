import type { BridgeEndpoint } from "./endpoint-store.js";

/**
 * SW wake reconnect decision (ADR-019 C8 / ADR-020 C3).
 *
 * Reconnect only when the in-memory pair token is still valid.
 * Otherwise the UI must prompt re-pair. Endpoint may still be stored.
 */
export type SwWakeDecision =
  | {
      readonly action: "reconnect";
      readonly endpoint: BridgeEndpoint;
      readonly token: string;
    }
  | {
      readonly action: "re-pair";
      readonly reason: "no-endpoint" | "no-token" | "token-expired";
      readonly endpoint: BridgeEndpoint | undefined;
    };

export type SwWakeInput = {
  readonly endpoint: BridgeEndpoint | undefined;
  readonly inMemoryToken: string | undefined;
  readonly tokenExpiresAt: number | undefined;
  readonly now: number;
};

/** Decide whether SW wake can silently re-open the bridge socket. */
export function decideSwWakeReconnect(input: SwWakeInput): SwWakeDecision {
  const { endpoint, inMemoryToken, tokenExpiresAt, now } = input;

  if (endpoint === undefined) {
    return { action: "re-pair", reason: "no-endpoint", endpoint: undefined };
  }

  if (inMemoryToken === undefined || inMemoryToken.length === 0) {
    return { action: "re-pair", reason: "no-token", endpoint };
  }

  if (tokenExpiresAt !== undefined && now >= tokenExpiresAt) {
    return { action: "re-pair", reason: "token-expired", endpoint };
  }

  return {
    action: "reconnect",
    endpoint,
    token: inMemoryToken,
  };
}
