import { z } from "zod";

/**
 * Source-confidence taxonomy and the never-wrong-HIGH policy (VC-V1V2-04 / PRD 14.5).
 *
 * Every source adapter declares WHICH evidence method(s) produced a candidate.
 * The resolver then enforces a single global rule: a candidate may carry
 * `confidence: "high"` ONLY when its evidence satisfies one of the strong
 * combinations below. An adapter that lies (claims HIGH with weak evidence) is
 * downgraded by the resolver before the candidate ever reaches the context
 * compiler or MCP server. The policy is enforced even when the adapter is wrong.
 *
 * This module intentionally does NOT import `SourceCandidate` — it owns only the
 * pure taxonomy and the predicate. The downgrade transform
 * ({@link enforceNeverWrongHigh}) lives next to the schema it mutates.
 */

/**
 * The three confidence levels. `high` means the resolver is willing to stake a
 * definitive source location on the candidate; `medium`/`low` mean it is not.
 */
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/** Numeric rank for sorting (lower sorts first = higher confidence). */
export const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Compare two confidence levels for sorting. Returns negative when `a` is more
 * confident than `b`, positive when less, 0 when equal.
 */
export const compareConfidence = (a: Confidence, b: Confidence): number =>
  CONFIDENCE_RANK[a] - CONFIDENCE_RANK[b];

/**
 * The seven canonical evidence methods an adapter may cite (VC-V1V2-04).
 *
 * - `marker` — opaque `data-vc-source` attribute. HIGH alone.
 * - `fingerprint` — DOM-path fingerprint match. MEDIUM alone; HIGH only with
 *   `manifest`.
 * - `manifest` — bundler/build manifest entry mapping a runtime id to source.
 *   HIGH only with `fingerprint` or `source-map` (+ range).
 * - `source-map` — source map pointing to a source range. HIGH only WITH a
 *   range; without one it is MEDIUM.
 * - `ast-origin` — AST origin analysis pinning the source location. HIGH alone.
 * - `text-search` — text search across candidate files. MEDIUM; never HIGH
 *   alone.
 * - `llm-inference` — LLM-inferred origin. LOW; advisory only; never HIGH.
 */
export const CONFIDENCE_EVIDENCE = [
  "marker",
  "fingerprint",
  "manifest",
  "source-map",
  "ast-origin",
  "text-search",
  "llm-inference",
] as const;

export type ConfidenceEvidence = (typeof CONFIDENCE_EVIDENCE)[number];

export const ConfidenceEvidenceSchema = z.enum(CONFIDENCE_EVIDENCE);

/**
 * Methods that, alone, can justify a HIGH candidate. `fingerprint` and
 * `manifest` are deliberately absent: each requires a partner to reach HIGH.
 */
const SOLO_STRONG_METHODS: ReadonlySet<ConfidenceEvidence> = new Set(["marker", "ast-origin"]);

/**
 * The never-wrong-HIGH predicate.
 *
 * Returns `true` only when the evidence combination is strong enough to back a
 * HIGH candidate:
 * - `marker` present, OR
 * - `ast-origin` present, OR
 * - BOTH `fingerprint` AND `manifest` present, OR
 * - `source-map` present AND a concrete source range (`hasRange`) is attached.
 *
 * `text-search` and `llm-inference` NEVER contribute to HIGH. `manifest` alone
 * and `fingerprint` alone never qualify. `source-map` without a range does not
 * qualify.
 *
 * @param evidence — the evidence methods cited by the candidate.
 * @param hasRange — whether the candidate carries a concrete source range
 *   (`startLine`/`endLine`). Required for the `source-map` path.
 */
export const satisfiesHighEvidence = (
  evidence: readonly ConfidenceEvidence[],
  hasRange: boolean,
): boolean => {
  const set = new Set(evidence);
  if (set.size === 0) return false;
  for (const method of SOLO_STRONG_METHODS) {
    if (set.has(method)) return true;
  }
  if (set.has("fingerprint") && set.has("manifest")) return true;
  if (set.has("source-map") && hasRange) return true;
  return false;
};
