/**
 * Redaction algorithms for Vision Control.
 *
 * Deny-by-default masking of secrets in strings and object trees. See ADR-009
 * and `docs/agents/security-privacy.md`. The pattern table (what counts as a
 * secret) lives in `redaction-patterns.ts`; this module owns how secrets are
 * masked and how the redaction is reported.
 *
 * Two layers compose:
 * 1. {@link redactString} applies an ordered list of regex patterns, then a
 *    built-in high-entropy token scan (the catch-all for secrets that do not
 *    match an explicit pattern).
 * 2. {@link redactObject} additionally replaces the value of any key whose name
 *    looks credential-shaped (password, token, apiKey, ...) before recursing.
 *
 * Redacted substrings are replaced with a stable marker `[REDACTED:<id>]` so a
 * {@link createPrivacyReport} can attribute each redaction to the rule that fired.
 */

import {
  DEFAULT_REDACTION_PATTERNS,
  REDACTED_MARKER,
  type RedactionPattern,
} from "./redaction-patterns.js";
import { looksLikeSecret, SECRET_ENTROPY_THRESHOLD, shannonEntropy } from "./secret-detection.js";

export {
  DEFAULT_REDACTION_PATTERNS,
  REDACTED_MARKER,
  type RedactionPattern,
} from "./redaction-patterns.js";

/** Minimum length of an alphanumeric run to be considered by the entropy scan. */
const ENTROPY_MIN_LENGTH = 20;

const HIGH_ENTROPY_TOKEN_RE = new RegExp(`[A-Za-z0-9_+/=-]{${ENTROPY_MIN_LENGTH},}`, "g");

/** Redact a string with the given patterns (defaults to the default ruleset). */
export const redactString = (
  input: string,
  patterns: readonly RedactionPattern[] = DEFAULT_REDACTION_PATTERNS,
): string => {
  let out = input;
  for (const rule of patterns) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  // High-entropy catch-all: mask long random tokens the regex rules missed.
  out = out.replace(HIGH_ENTROPY_TOKEN_RE, (token) =>
    token.includes(REDACTED_MARKER) || shannonEntropy(token) <= SECRET_ENTROPY_THRESHOLD
      ? token
      : "[REDACTED:high-entropy]",
  );
  return out;
};

/** Key names whose value is treated as a secret regardless of the value shape. */
const SENSITIVE_KEY_RE =
  /^(pass(word|wd)?|pwd|secret|secrets|token|tokens|access_?token|refresh_?token|auth_?token|id_?token|api[_-]?key|api[_-]?keys|api[_-]?secret|client[_-]?secret|credential|credentials|cookie|cookies|authorization|authorisation|private_?key|access_?key|secret_?key)$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const redactNode = (
  value: unknown,
  patterns: readonly RedactionPattern[],
  seen: WeakSet<object>,
): unknown => {
  if (typeof value === "string") {
    return redactString(value, patterns);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[REDACTED:circular]";
    }
    seen.add(value);
    return value.map((item) => redactNode(item, patterns, seen));
  }
  if (isRecord(value)) {
    if (seen.has(value)) {
      return "[REDACTED:circular]";
    }
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_RE.test(key)
        ? `[REDACTED:sensitive-key:${key}]`
        : redactNode(child, patterns, seen);
    }
    return out;
  }
  return value;
};

/** Deep-redact an arbitrary value. Returns a new value; the input is never mutated. */
export const redactObject = (
  obj: unknown,
  patterns: readonly RedactionPattern[] = DEFAULT_REDACTION_PATTERNS,
): unknown => redactNode(obj, patterns, new WeakSet<object>());

export interface PrivacyReportRedaction {
  readonly field: string;
  readonly patternId: string;
  readonly description: string;
}

export interface PrivacyReport {
  readonly redactions: readonly PrivacyReportRedaction[];
  readonly totalRedacted: number;
}

const describeRule = (patternId: string, patterns: readonly RedactionPattern[]): string => {
  if (patternId === "sensitive-key") {
    return "Value of a credential-shaped key was masked.";
  }
  if (patternId === "high-entropy") {
    return "Long high-entropy token looked secret-like.";
  }
  if (patternId === "unknown") {
    return "Value changed during redaction (rule attribution unavailable).";
  }
  return patterns.find((rule) => rule.id === patternId)?.description ?? "Redacted value.";
};

const attributeString = (original: string, patterns: readonly RedactionPattern[]): string => {
  for (const rule of patterns) {
    if (rule.pattern.test(original)) {
      rule.pattern.lastIndex = 0;
      return rule.id;
    }
  }
  return looksLikeSecret(original) ? "high-entropy" : "unknown";
};

/**
 * Build a {@link PrivacyReport} by diffing `original` against `redacted`. Every
 * leaf that differs is attributed to the rule that most likely fired. The report
 * never includes the original secret values — only paths, rule ids, and reasons.
 */
export const createPrivacyReport = (
  original: unknown,
  redacted: unknown,
  patterns: readonly RedactionPattern[] = DEFAULT_REDACTION_PATTERNS,
): PrivacyReport => {
  const redactions: PrivacyReportRedaction[] = [];
  walk(original, redacted, [], redactions, patterns);
  return { redactions, totalRedacted: redactions.length };
};

const walk = (
  original: unknown,
  redacted: unknown,
  path: readonly string[],
  out: PrivacyReportRedaction[],
  patterns: readonly RedactionPattern[],
): void => {
  if (typeof original === "string" || typeof redacted === "string") {
    if (original !== redacted) {
      const patternId =
        typeof original === "string" ? attributeString(original, patterns) : "unknown";
      out.push({
        field: path.join(".") || "<root>",
        patternId,
        description: describeRule(patternId, patterns),
      });
    }
    return;
  }
  if (Array.isArray(original) && Array.isArray(redacted)) {
    const length = Math.min(original.length, redacted.length);
    for (let i = 0; i < length; i += 1) {
      walk(original[i], redacted[i], [...path, String(i)], out, patterns);
    }
    return;
  }
  if (isRecord(original) && isRecord(redacted)) {
    for (const key of Object.keys(original)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        if (JSON.stringify(original[key]) !== JSON.stringify(redacted[key])) {
          out.push({
            field: [...path, key].join("."),
            patternId: "sensitive-key",
            description: describeRule("sensitive-key", patterns),
          });
        }
        continue;
      }
      walk(original[key], redacted[key], [...path, key], out, patterns);
    }
  }
};
