/**
 * Candidate values for constrained primitives (VC-V1V2-21).
 *
 * For a prop whose value type is constrained (boolean, string-literal union,
 * number range), this module computes the set of candidate values a user might
 * switch to. Free-form strings have no candidates.
 *
 * Candidate values drive the deterministic suggestion: a `<Button variant="secondary">`
 * change to `variant="primary"` produces a suggestion ONLY when `primary` is in
 * the constrained candidate set for `variant`.
 */

import type { DiscoveredProp } from "./prop-discovery.js";

/** The constrained value type of a prop. */
export type PropValueType =
  | "boolean"
  | "string-literal-union"
  | "number-range"
  | "free-form-string";

/** Type metadata for a prop, derived from TS types or prop-types. */
export interface PropTypeMetadata {
  readonly type: PropValueType;
  /** For `string-literal-union`: the literal set (e.g. ["primary", "secondary"]). */
  readonly literals?: readonly string[];
  /** For `number-range`: the inclusive min value. */
  readonly min?: number;
  /** For `number-range`: the inclusive max value. */
  readonly max?: number;
  /** For `number-range`: suggested step between candidates. */
  readonly step?: number;
}

/** A candidate value for a constrained prop. */
export interface CandidateValue {
  readonly value: string;
  readonly label: string;
}

/** Result of computing candidate values. */
export interface CandidateValuesResult {
  readonly candidates: readonly CandidateValue[];
  readonly valueType: PropValueType;
  readonly constrained: boolean;
}

/**
 * Compute candidate values for a prop given its type metadata.
 *
 * - `boolean` → candidates `[true, false]`.
 * - `string-literal-union` → the literal set as candidates.
 * - `number-range` → min, max, and step-based suggestions (capped).
 * - `free-form-string` → no candidates (constrained is false).
 */
export const candidateValuesFor = (metadata: PropTypeMetadata): CandidateValuesResult => {
  switch (metadata.type) {
    case "boolean":
      return {
        candidates: [
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
        valueType: "boolean",
        constrained: true,
      };
    case "string-literal-union": {
      const literals = metadata.literals ?? [];
      return {
        candidates: literals.map((lit) => ({ value: lit, label: lit })),
        valueType: "string-literal-union",
        constrained: literals.length > 0,
      };
    }
    case "number-range": {
      const min = metadata.min ?? 0;
      const max = metadata.max ?? 0;
      const step = metadata.step ?? 1;
      return {
        candidates: buildNumberCandidates(min, max, step),
        valueType: "number-range",
        constrained: min !== max,
      };
    }
    default:
      return {
        candidates: [],
        valueType: "free-form-string",
        constrained: false,
      };
  }
};

/**
 * Check whether a desired value is a valid candidate for a constrained prop.
 * Returns true when the value is in the candidate set (or the prop is
 * unconstrained — free-form strings accept any value).
 */
export const isValidCandidate = (desiredValue: string, metadata: PropTypeMetadata): boolean => {
  const result = candidateValuesFor(metadata);
  if (!result.constrained) return true;
  return result.candidates.some((c) => c.value === desiredValue);
};

/**
 * Infer type metadata from a discovered prop's current literal value when no
 * explicit metadata is available. This is a best-effort heuristic:
 * - literal-boolean → `boolean`
 * - literal-number → `number-range` with the value as both min and max (single point)
 * - literal-string → `free-form-string` (no constraint without type info)
 */
export const inferTypeMetadata = (prop: DiscoveredProp): PropTypeMetadata => {
  if (prop.kind === "literal-boolean") {
    return { type: "boolean" };
  }
  if (prop.kind === "literal-number") {
    const value =
      typeof prop.literalValue === "number" ? prop.literalValue : Number.parseFloat(prop.rawValue);
    if (Number.isFinite(value)) {
      return { type: "number-range", min: value, max: value, step: 1 };
    }
  }
  return { type: "free-form-string" };
};

const MAX_NUMBER_CANDIDATES = 20;

const buildNumberCandidates = (min: number, max: number, step: number): CandidateValue[] => {
  if (min > max || step <= 0) return [];
  const candidates: CandidateValue[] = [];
  let current = min;
  let count = 0;
  while (current <= max + 1e-9 && count < MAX_NUMBER_CANDIDATES) {
    candidates.push({
      value: formatNumber(current),
      label: formatNumber(current),
    });
    current += step;
    count += 1;
  }
  return candidates;
};

const formatNumber = (n: number): string => {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
};
