/**
 * Extension pair token (ADR-020 C3).
 *
 * Separate from agent Bearer (`VC_MCP_TOKEN`). Minted once at process start,
 * printed once on stderr, never on stdout or `/discover`. TTL 5 minutes.
 */

import { type GeneratePairingTokenOptions, generatePairingToken } from "@vision-control/security";

import { PAIR_TOKEN_TTL_MS } from "./constants.js";

export interface PairTokenState {
  readonly token: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly pairingUrl: string;
}

export interface MintPairTokenOptions {
  readonly now?: () => number;
  readonly ttlMs?: number;
  readonly randomBytes?: GeneratePairingTokenOptions["randomBytes"];
  readonly pairingUrlBase?: string;
}

/** Mint a fresh extension pair token (5-minute TTL by default). */
export function mintPairToken(options: MintPairTokenOptions = {}): PairTokenState {
  const minted = generatePairingToken({
    now: options.now,
    ttlMs: options.ttlMs ?? PAIR_TOKEN_TTL_MS,
    randomBytes: options.randomBytes,
    pairingUrlBase: options.pairingUrlBase ?? "vision-control://pair",
  });
  return {
    token: minted.token,
    issuedAt: minted.issuedAt,
    expiresAt: minted.expiresAt,
    pairingUrl: minted.pairingUrl,
  };
}

/**
 * Constant-time equality for pair-token comparison.
 * Length mismatch short-circuits (still not a timing oracle for content).
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export type PairTokenValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "missing" | "mismatch" | "expired" };

/** Validate a candidate pair token against the minted state. */
export function validatePairToken(
  state: PairTokenState,
  candidate: string | undefined,
  now: number = Date.now(),
): PairTokenValidation {
  if (candidate === undefined || candidate.length === 0) {
    return { ok: false, reason: "missing" };
  }
  if (now >= state.expiresAt) {
    return { ok: false, reason: "expired" };
  }
  if (!constantTimeEquals(candidate, state.token)) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true };
}

/**
 * Stderr-only pairing lines. Callers must write these to stderr, never stdout
 * (stdout is reserved for agent MCP JSON-RPC).
 */
export function formatPairingStderrLines(
  state: PairTokenState,
  host: string,
  port: number,
): readonly string[] {
  const minutes = Math.max(1, Math.round((state.expiresAt - state.issuedAt) / 60_000));
  return [
    `[vision-control-mcp] pair token (valid ${minutes}m): ${state.token}`,
    `[vision-control-mcp] pair URL: ${state.pairingUrl}`,
    `[vision-control-mcp] discover: http://${host}:${port}/discover  bridge: ws://${host}:${port}/bridge`,
  ];
}

/** Write pairing material once to `write` (must be stderr in production). */
export function printPairingToStderr(
  state: PairTokenState,
  host: string,
  port: number,
  write: (line: string) => void,
): void {
  for (const line of formatPairingStderrLines(state, host, port)) {
    write(line);
  }
}
