/**
 * Pairing token model.
 *
 * The daemon mints a short-lived, single-use pairing token that the browser
 * extension presents once to establish a session (PRD §24.2). The raw token is
 * shown to the user exactly once and is never persisted — only its hash is
 * stored in the `sessions` table (see `packages/storage`). Logging the raw
 * token is forbidden; see ADR-009.
 */

import { z } from "zod";

/** Number of random bytes of entropy in a pairing token (>= 32, per task spec). */
export const PAIRING_TOKEN_ENTROPY_BYTES = 32;

/** Default pairing-token lifetime: 5 minutes. */
export const DEFAULT_PAIRING_TOKEN_TTL_MS = 5 * 60 * 1000;

export const PairingTokenSchema = z.object({
  /** URL-safe base64 random token. Never logged; only its hash is stored. */
  token: z.string().min(1),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  pairingUrl: z.string().min(1),
  used: z.boolean().default(false),
});

export type PairingToken = z.infer<typeof PairingTokenSchema>;

export interface GeneratePairingTokenOptions {
  /** Base URL the token is appended to, e.g. `vision-control://pair`. Defaults to a sentinel. */
  readonly pairingUrlBase?: string;
  /** Lifetime in milliseconds. Defaults to {@link DEFAULT_PAIRING_TOKEN_TTL_MS}. */
  readonly ttlMs?: number;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => number;
  /** Injectable randomness for deterministic tests. Returns exactly `n` bytes. */
  readonly randomBytes?: (n: number) => Uint8Array;
}

/**
 * Encode a byte array to URL-safe base64 (RFC 4648 §5) with no padding.
 *
 * Implemented by hand so the module is fully isomorphic: it relies on neither
 * Node's `Buffer` nor `btoa`, so it type-checks and runs in both the daemon
 * (Node) and any browser context that imports the types.
 */
const toBase64Url = (bytes: Uint8Array): string => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const at = (index: number): string => alphabet[index] ?? "";
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += at((n >> 18) & 63) + at((n >> 12) & 63) + at((n >> 6) & 63) + at(n & 63);
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const n = bytes[i] ?? 0;
    out += at(n >> 2) + at((n << 4) & 63);
  } else if (remaining === 2) {
    const n = ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
    out += at(n >> 10) + at((n >> 4) & 63) + at((n << 2) & 63);
  }
  return out;
};

const defaultRandomBytes = (n: number): Uint8Array => {
  // Web Crypto via the global is available in Node 19+ and all modern browsers,
  // keeping this module isomorphic without importing `node:crypto`.
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

/**
 * Mint a fresh pairing token with at least {@link PAIRING_TOKEN_ENTROPY_BYTES}
 * bytes of cryptographically random entropy, URL-safe base64 encoded.
 *
 * Callers must hash `token` before persisting it; never store or log the raw
 * value. The `pairingUrl` is the one-time URL the user/extension consumes.
 */
export const generatePairingToken = (options: GeneratePairingTokenOptions = {}): PairingToken => {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? DEFAULT_PAIRING_TOKEN_TTL_MS;
  const randomBytes = options.randomBytes ?? defaultRandomBytes;
  const base = options.pairingUrlBase ?? "vision-control://pair";

  const token = toBase64Url(randomBytes(PAIRING_TOKEN_ENTROPY_BYTES));
  const issuedAt = now();
  return PairingTokenSchema.parse({
    token,
    issuedAt,
    expiresAt: issuedAt + ttl,
    pairingUrl: `${base}?token=${token}`,
    used: false,
  });
};

/**
 * Hash a raw pairing token for storage. Uses SHA-256 via Web Crypto (isomorphic).
 * The returned hex digest is what lives in the `sessions.token_hash` column.
 */
export const hashPairingToken = async (token: string): Promise<string> => {
  const data = new TextEncoder().encode(token);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};
