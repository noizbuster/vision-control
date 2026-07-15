import { describe, expect, it } from "vitest";

import {
  assignMapOriginConfidence,
  enforceMapOriginNeverWrongHigh,
  hasMapOriginRange,
  MAP_POLICY_WARNINGS,
  type MapConfidenceFacts,
  type MapPolicyConfidence,
  qualifiesMapHigh,
} from "./confidence-policy.js";
import type { MapOrigin } from "./types.js";

interface PolicyCase {
  readonly name: string;
  readonly facts: MapConfidenceFacts;
  readonly expected: MapPolicyConfidence;
  readonly qualifiesForHigh: boolean;
  readonly warningIncludes?: string;
}

/**
 * Table-driven never-wrong-HIGH matrix for map origins (ADR-019 C4).
 * No HIGH without map+range; no text-search HIGH; no marker HIGH product path.
 */
const POLICY_MATRIX: readonly PolicyCase[] = [
  {
    name: "map + range → high",
    facts: { hasMap: true, hasRange: true },
    expected: "high",
    qualifiesForHigh: true,
  },
  {
    name: "map + range via evidence tag → high",
    facts: { hasMap: true, hasRange: true, evidence: ["map-with-range"] },
    expected: "high",
    qualifiesForHigh: true,
  },
  {
    name: "module path only → medium",
    facts: { hasMap: true, hasRange: false, modulePathOnly: true },
    expected: "medium",
    qualifiesForHigh: false,
    warningIncludes: MAP_POLICY_WARNINGS.modulePathOnly,
  },
  {
    name: "module-path-only evidence → medium (never high)",
    facts: { hasMap: true, hasRange: true, modulePathOnly: true },
    expected: "medium",
    qualifiesForHigh: false,
    warningIncludes: MAP_POLICY_WARNINGS.modulePathOnly,
  },
  {
    name: "map without range → medium",
    facts: { hasMap: true, hasRange: false },
    expected: "medium",
    qualifiesForHigh: false,
    warningIncludes: MAP_POLICY_WARNINGS.mapWithoutRange,
  },
  {
    name: "absent map → none",
    facts: { hasMap: false, hasRange: false },
    expected: "none",
    qualifiesForHigh: false,
  },
  {
    name: "range claimed without map → none (not high)",
    facts: { hasMap: false, hasRange: true },
    expected: "none",
    qualifiesForHigh: false,
  },
  {
    name: "text-search never HIGH (no map)",
    facts: { hasMap: false, hasRange: true, evidence: ["text-search"] },
    expected: "none",
    qualifiesForHigh: false,
    warningIncludes: MAP_POLICY_WARNINGS.textSearchRejected,
  },
  {
    name: "text-search never HIGH (even with map claim)",
    facts: { hasMap: true, hasRange: true, evidence: ["text-search"] },
    expected: "medium",
    qualifiesForHigh: false,
    warningIncludes: MAP_POLICY_WARNINGS.textSearchRejected,
  },
  {
    name: "marker HIGH is not a map-origin product path",
    facts: { hasMap: false, hasRange: false, evidence: ["marker"] },
    expected: "none",
    qualifiesForHigh: false,
    warningIncludes: MAP_POLICY_WARNINGS.markerRejected,
  },
  {
    name: "marker with map still not HIGH product path",
    facts: { hasMap: true, hasRange: true, evidence: ["marker"] },
    expected: "none",
    qualifiesForHigh: false,
    warningIncludes: MAP_POLICY_WARNINGS.markerRejected,
  },
  {
    name: "absent evidence tag → none",
    facts: { hasMap: true, hasRange: true, evidence: ["absent"] },
    expected: "none",
    qualifiesForHigh: false,
  },
];

describe("assignMapOriginConfidence — table-driven policy matrix", () => {
  it.each(POLICY_MATRIX)("$name", ({ facts, expected, qualifiesForHigh, warningIncludes }) => {
    const decision = assignMapOriginConfidence(facts);
    expect(decision.confidence).toBe(expected);
    expect(decision.qualifiesForHigh).toBe(qualifiesForHigh);
    expect(qualifiesMapHigh(facts)).toBe(qualifiesForHigh);
    if (warningIncludes !== undefined) {
      expect(decision.warnings).toContain(warningIncludes);
    }
    // Never-wrong-HIGH: high only when qualifiesForHigh.
    if (decision.confidence === "high") {
      expect(decision.qualifiesForHigh).toBe(true);
      expect(facts.hasMap).toBe(true);
      expect(facts.hasRange || (facts.evidence ?? []).includes("map-with-range")).toBe(true);
    }
  });

  it("never assigns HIGH without map+range across the full matrix", () => {
    for (const row of POLICY_MATRIX) {
      const decision = assignMapOriginConfidence(row.facts);
      if (decision.confidence === "high") {
        expect(row.facts.hasMap).toBe(true);
        expect(row.facts.hasRange || (row.facts.evidence ?? []).includes("map-with-range")).toBe(
          true,
        );
        expect(row.facts.modulePathOnly).not.toBe(true);
        expect(row.facts.evidence ?? []).not.toContain("text-search");
        expect(row.facts.evidence ?? []).not.toContain("marker");
      }
    }
  });
});

describe("enforceMapOriginNeverWrongHigh", () => {
  const base = (partial: Partial<MapOrigin>): MapOrigin => ({
    confidence: "high",
    warnings: [],
    ...partial,
  });

  it("keeps honest map+range HIGH", () => {
    const origin = base({
      mapUrl: "https://app.test/a.css.map",
      relativePath: "src/a.css",
      startLine: 1,
      endLine: 3,
      kind: "css",
    });
    expect(enforceMapOriginNeverWrongHigh(origin).confidence).toBe("high");
  });

  it("downgrades HIGH without range to medium + warning", () => {
    const origin = base({
      mapUrl: "https://app.test/a.css.map",
      relativePath: "src/a.css",
      kind: "css",
    });
    const enforced = enforceMapOriginNeverWrongHigh(origin);
    expect(enforced.confidence).toBe("medium");
    expect(enforced.warnings).toContain(MAP_POLICY_WARNINGS.neverWrongHigh);
  });

  it("downgrades JS module-path HIGH (DOM→JSX HIGH forbidden)", () => {
    const origin = base({
      mapUrl: "https://app.test/main.js.map",
      relativePath: "src/App.tsx",
      kind: "js",
      warnings: [MAP_POLICY_WARNINGS.modulePathOnly],
    });
    const enforced = enforceMapOriginNeverWrongHigh(origin);
    expect(enforced.confidence).toBe("medium");
    expect(enforced.confidence).not.toBe("high");
  });

  it("leaves medium origins untouched", () => {
    const origin = base({
      confidence: "medium",
      mapUrl: "https://app.test/a.css.map",
      warnings: [MAP_POLICY_WARNINGS.mapWithoutRange],
    });
    expect(enforceMapOriginNeverWrongHigh(origin)).toEqual(origin);
  });
});

describe("hasMapOriginRange", () => {
  it("requires both startLine and endLine", () => {
    expect(hasMapOriginRange({ startLine: 1, endLine: 2 })).toBe(true);
    expect(hasMapOriginRange({ startLine: 1 })).toBe(false);
    expect(hasMapOriginRange({ endLine: 2 })).toBe(false);
    expect(hasMapOriginRange({})).toBe(false);
  });
});
