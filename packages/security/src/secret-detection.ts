/**
 * Secret detection heuristic.
 *
 * Used by the redaction layer (to catch secrets that do not match an explicit
 * regex pattern) and by the context compiler (task 24) to flag secret-like
 * values before they leave the daemon.
 *
 * The heuristic is intentionally high-recall / lower-precision: false positives
 * (masking a non-secret) are acceptable; false negatives (leaking a real
 * secret) are the failure mode to avoid. See ADR-009.
 */

/**
 * Well-known credential / API-key prefixes. A value starting with any of these
 * is treated as a secret regardless of its entropy.
 */
export const KNOWN_SECRET_PREFIXES = [
  "sk_", // Stripe secret key
  "pk_", // Stripe publishable-ish key (still credential-shaped)
  "rk_", // Stripe restricted key
  "AKIA", // AWS access key id
  "ghp_", // GitHub personal access token
  "gho_", // GitHub OAuth token
  "ghu_", // GitHub user-to-server token
  "ghs_", // GitHub server-to-server token
  "github_pat_", // GitHub fine-grained PAT
  "xoxb-", // Slack bot token
  "xoxp-", // Slack user token
  "xoxe-", // Slack app token
  "glpat-", // GitLab PAT
  "AIza", // Google API key
  "ya29.", // Google OAuth token
  "eyJ", // JWT (three base64 segments, first starts with eyJ)
  "ghr_", // GitHub refresh token
] as const;

const KNOWN_PREFIX_RE = new RegExp(
  `^(?:${KNOWN_SECRET_PREFIXES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
);

/** Minimum length for a value to be considered "long enough" for entropy analysis. */
export const MIN_ENTROPY_LENGTH = 20;

/** Shannon entropy threshold (bits/char) above which a long string looks secret-like. */
const HIGH_ENTROPY_THRESHOLD = 4.5;

/** Regex selecting candidate long alphanumeric runs for entropy analysis. */
const HIGH_ENTROPY_TOKEN_RE = new RegExp(`[A-Za-z0-9_+/=-]{${MIN_ENTROPY_LENGTH},}`, "g");

/**
 * Compute Shannon entropy (bits per character) of a string.
 *
 * `H = -sum(p_i * log2(p_i))` over the character frequency distribution. A
 * uniformly-random base64 string scores ~6.0; hex ~4.0; English prose ~3.5-4.0.
 */
export const shannonEntropy = (value: string): number => {
  if (value.length === 0) {
    return 0;
  }
  const counts = new Map<string, number>();
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
};

/**
 * Return true when `value` looks like a secret.
 *
 * Two independent signals, either of which is sufficient:
 * 1. It starts with a well-known credential prefix (see {@link KNOWN_SECRET_PREFIXES}).
 * 2. It is a long (>= {@link MIN_ENTROPY_LENGTH}) alphanumeric run whose Shannon
 *    entropy exceeds {@link HIGH_ENTROPY_THRESHOLD} — the signature of a random
 *    token, key, or hash.
 *
 * Short, low-entropy values (names, ids, booleans) are not flagged.
 */
export const looksLikeSecret = (value: string): boolean => {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  if (KNOWN_PREFIX_RE.test(value)) {
    return true;
  }
  // Extract the longest alphanumeric run and score it. Scoring the longest run
  // avoids entropy dilution from surrounding punctuation/whitespace.
  const tokens = value.match(HIGH_ENTROPY_TOKEN_RE);
  if (tokens === null) {
    return false;
  }
  return tokens.some((token) => shannonEntropy(token) > HIGH_ENTROPY_THRESHOLD);
};

/** Re-exported so callers can reuse the same threshold for custom heuristics. */
export const SECRET_ENTROPY_THRESHOLD = HIGH_ENTROPY_THRESHOLD;
