/**
 * The default redaction ruleset and shared redaction constants.
 *
 * Split out of `redaction.ts` so the data table (what counts as a secret) is
 * separate from the algorithms (how secrets are masked). See ADR-009.
 */

/** Marker prefix stamped over every redacted value. */
export const REDACTED_MARKER = "[REDACTED";

/** A single named redaction rule applied to string values. */
export interface RedactionPattern {
  /** Stable id, e.g. `"password"`. Surfaces in the privacy report. */
  readonly id: string;
  /** Human-readable reason, surfaced in the privacy report. */
  readonly description: string;
  /** Global regex that matches the secret-bearing substring. Always carries `g`. */
  readonly pattern: RegExp;
  /** Replacement string (may reference capture groups). */
  readonly replacement: string;
}

/** Ensure a rule regex is global and case-insensitive (idempotent on flags). */
const withFlags = (re: RegExp): RegExp =>
  new RegExp(re.source, `${re.flags.includes("g") ? "" : "g"}${re.flags.includes("i") ? "" : "i"}`);

/**
 * The default, ordered redaction ruleset. Covers every category required by
 * ADR-009 / `docs/agents/security-privacy.md`: passwords, API keys, bearer
 * tokens, cookies, auth headers, JWTs, credit-card numbers, SSN-like patterns,
 * known credential prefixes, and email addresses.
 *
 * The high-entropy catch-all is applied automatically by `redactString` after
 * these patterns run; it is not a regex so it is not listed here.
 */
export const DEFAULT_REDACTION_PATTERNS: readonly RedactionPattern[] = [
  {
    id: "password",
    description: "Password assignment (password=..., passwd:, pwd:).",
    pattern: withFlags(/\b(password|passwd|pwd)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s;"',&]+)/),
    replacement: "$1=[REDACTED:password]",
  },
  {
    id: "api-key-assignment",
    description: "API key / secret assignment (api_key=..., apikey:, apiSecret:).",
    pattern: withFlags(
      /\b(api[_-]?key|apikey|api[_-]?secret|client[_-]?secret)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s;"',&]+)/,
    ),
    replacement: "$1=[REDACTED:api-key]",
  },
  {
    id: "auth-header",
    description: "Authorization header value (authorization: ...).",
    pattern: withFlags(/\b(authorization)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\r\n;]+)/),
    replacement: "$1=[REDACTED:auth-header]",
  },
  {
    id: "bearer-token",
    description: "Bearer token (Bearer <token>).",
    pattern: withFlags(/\bbearer\s+[A-Za-z0-9._~+/=-]+/),
    replacement: "bearer [REDACTED:bearer-token]",
  },
  {
    id: "cookie",
    description: "Cookie / Set-Cookie value.",
    pattern: withFlags(/\b(set-?cookie|cookie)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\r\n;]+)/),
    replacement: "$1=[REDACTED:cookie]",
  },
  {
    id: "jwt",
    description: "JSON Web Token (three base64url segments, header starts with eyJ).",
    pattern: /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g,
    replacement: "[REDACTED:jwt]",
  },
  {
    id: "credit-card",
    description: "Credit-card number (13-16 digits, optional spaces or dashes).",
    pattern: /\b(?:\d[ -]?){13,16}\b/g,
    replacement: "[REDACTED:credit-card]",
  },
  {
    id: "ssn",
    description: "US Social-Security-number-like pattern (XXX-XX-XXXX).",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: "[REDACTED:ssn]",
  },
  {
    id: "known-secret-prefix",
    description: "Known credential prefixes (sk_, pk_, AKIA, ghp_, xoxb-, AIza, etc.).",
    pattern:
      /\b(?:sk_[A-Za-z0-9_]{16,}|pk_[A-Za-z0-9_]{16,}|rk_[A-Za-z0-9_]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghu_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,}|xox[bpe]-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{10,}|glpat-[A-Za-z0-9_-]{20}|AIza[0-9A-Za-z_-]{35}|ya29\.[A-Za-z0-9_-]+)\b/g,
    replacement: "[REDACTED:api-key]",
  },
  {
    id: "email",
    description: "Email address (optional category; on by default).",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[REDACTED:email]",
  },
];
