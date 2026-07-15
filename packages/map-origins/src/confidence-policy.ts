/**
 * Map-origin confidence policy (ADR-019 C4 never-wrong-HIGH).
 *
 * Matrix (product path for maps only):
 * | Evidence                         | Confidence |
 * | map + concrete range             | high       |
 * | module path only (JS candidates) | medium     |
 * | map present without range        | medium     |
 * | map / origin absent              | none       |
 *
 * Forbidden on this path:
 * - text-search HIGH (never)
 * - marker HIGH product path (never; marker HIGH is dropped under ADR-019)
 * - DOM→JSX HIGH without map+range (never)
 *
 * `none` means "do not emit an origin" — callers skip rather than invent LOW.
 */

import type { MapOrigin, OriginConfidence } from "./types.js";

/** Evidence kinds the map-origin policy understands. */
export type MapConfidenceEvidence =
  | "map-with-range"
  | "map-without-range"
  | "module-path-only"
  | "absent"
  | "text-search"
  | "marker";

/** Policy output; `none` means do not emit an origin. */
export type MapPolicyConfidence = OriginConfidence | "none";

/** Structural facts used to assign confidence. */
export interface MapConfidenceFacts {
  readonly hasMap: boolean;
  readonly hasRange: boolean;
  /** True for JS module candidates (path only, no generated→original range). */
  readonly modulePathOnly?: boolean;
  /**
   * Explicit evidence tags for adversarial / enforcement cases.
   * `text-search` and `marker` never qualify for HIGH on the map path.
   */
  readonly evidence?: readonly MapConfidenceEvidence[];
}

/** Result of applying the map confidence policy. */
export interface MapConfidenceDecision {
  readonly confidence: MapPolicyConfidence;
  readonly warnings: readonly string[];
  /** True only when map+range qualifies for HIGH. */
  readonly qualifiesForHigh: boolean;
}

/** Stable warning strings emitted by the policy. */
export const MAP_POLICY_WARNINGS = {
  mapWithoutRange: "map-present-without-range",
  modulePathOnly: "module-path-only",
  neverWrongHigh: "downgraded by never-wrong-HIGH policy: map origin lacks map+range",
  textSearchRejected: "text-search cannot produce HIGH on map path",
  markerRejected: "marker HIGH is not a map-origin product path",
} as const;

/**
 * True only when a map is present AND a concrete source range is attached,
 * and the origin is not a module-path-only candidate. Forbidden evidence
 * (`text-search`, `marker`) never qualifies.
 */
export const qualifiesMapHigh = (facts: MapConfidenceFacts): boolean => {
  if (!facts.hasMap || !facts.hasRange) return false;
  if (facts.modulePathOnly === true) return false;
  const evidence = facts.evidence ?? [];
  if (evidence.includes("text-search")) return false;
  if (evidence.includes("marker")) return false;
  if (evidence.includes("module-path-only")) return false;
  if (evidence.includes("absent")) return false;
  return true;
};

/**
 * Assign map-origin confidence from structural facts.
 *
 * Given: hasMap / hasRange / modulePathOnly / optional evidence tags.
 * When: policy matrix is applied.
 * Then: high only for map+range; medium for module path or map-without-range;
 * none when absent; never HIGH for text-search or marker product path.
 */
export const assignMapOriginConfidence = (facts: MapConfidenceFacts): MapConfidenceDecision => {
  const evidence = facts.evidence ?? [];

  // Forbidden product paths — never HIGH, even if a range is claimed.
  if (evidence.includes("text-search")) {
    return {
      confidence: facts.hasMap ? "medium" : "none",
      warnings: [MAP_POLICY_WARNINGS.textSearchRejected],
      qualifiesForHigh: false,
    };
  }
  if (evidence.includes("marker")) {
    return {
      confidence: "none",
      warnings: [MAP_POLICY_WARNINGS.markerRejected],
      qualifiesForHigh: false,
    };
  }

  if (!facts.hasMap || evidence.includes("absent")) {
    return { confidence: "none", warnings: [], qualifiesForHigh: false };
  }

  if (facts.modulePathOnly === true || evidence.includes("module-path-only")) {
    return {
      confidence: "medium",
      warnings: [MAP_POLICY_WARNINGS.modulePathOnly],
      qualifiesForHigh: false,
    };
  }

  if (facts.hasRange || evidence.includes("map-with-range")) {
    if (qualifiesMapHigh({ ...facts, hasRange: true })) {
      return { confidence: "high", warnings: [], qualifiesForHigh: true };
    }
  }

  // Map present without a concrete range.
  return {
    confidence: "medium",
    warnings: [MAP_POLICY_WARNINGS.mapWithoutRange],
    qualifiesForHigh: false,
  };
};

/**
 * True when a {@link MapOrigin} carries a concrete source range (1-based lines).
 */
export const hasMapOriginRange = (origin: Pick<MapOrigin, "startLine" | "endLine">): boolean =>
  origin.startLine !== undefined && origin.endLine !== undefined;

/**
 * Enforce never-wrong-HIGH on a single map origin.
 *
 * If the origin claims `high` without map+range (or is module-path-only /
 * forbidden evidence), downgrade to `medium` and append a policy warning.
 * Already medium/low origins are returned unchanged.
 */
export const enforceMapOriginNeverWrongHigh = (origin: MapOrigin): MapOrigin => {
  if (origin.confidence !== "high") return origin;

  const modulePathOnly =
    origin.kind === "js" || origin.warnings.includes(MAP_POLICY_WARNINGS.modulePathOnly);

  const decision = assignMapOriginConfidence({
    hasMap: origin.mapUrl !== undefined || origin.relativePath !== undefined,
    hasRange: hasMapOriginRange(origin),
    modulePathOnly,
  });

  if (decision.confidence === "high") return origin;

  const confidence: OriginConfidence =
    decision.confidence === "none" ? "medium" : decision.confidence;

  const warnings = mergeWarnings(origin.warnings, [
    ...decision.warnings,
    MAP_POLICY_WARNINGS.neverWrongHigh,
  ]);

  return { ...origin, confidence, warnings };
};

const mergeWarnings = (
  existing: readonly string[],
  extra: readonly string[],
): readonly string[] => {
  const out = [...existing];
  for (const w of extra) {
    if (!out.includes(w)) out.push(w);
  }
  return out;
};
