/**
 * Tailwind source-candidate production (VC-V1V2-11).
 *
 * Maps a parsed className + its AST origin (if any) to a {@link SourceCandidate}
 * applying the never-wrong-HIGH policy from the adapter/confidence contract:
 *
 * - STATIC origin (literal in `className="..."`, `cn`/`clsx`/`cva`) → HIGH with
 *   `ast-origin` evidence, the source range, and a nearest-token suggestion.
 * - DYNAMIC origin (conditional branch literal) → MEDIUM with an agent-required
 *   warning; NEVER HIGH; no deterministic patch suggestion.
 * - NO origin located (token not found in configured source files) → MEDIUM/LOW
 *   with an agent-required warning; the runtime class is real but its source is
 *   unverified.
 */

import type { ClassNameAstOrigin } from "./ast-origins.js";
import type { ParsedClassName } from "./class-parser.js";
import {
  type Confidence,
  type ConfidenceEvidence,
  candidate,
  type SourceCandidate,
} from "./contract.js";
import type { TailwindToken, TailwindTokenRegistry } from "./tokens.js";

export interface TailwindCandidateInput {
  readonly className: string;
  readonly parsed: ParsedClassName;
  readonly registry: TailwindTokenRegistry;
  readonly origin: ClassNameAstOrigin | undefined;
  readonly runtimeInstanceCount: number;
  /** Other token-bearing classes on the same element that share a conflict group. */
  readonly conflictPeers: readonly string[];
}

const AST_ORIGIN_EVIDENCE: readonly ConfidenceEvidence[] = ["ast-origin"];
const TEXT_SEARCH_EVIDENCE: readonly ConfidenceEvidence[] = ["text-search"];

/** Rebuild a className string from its parts with a (possibly new) value key. */
const rebuildClassName = (parsed: ParsedClassName, valueOverride: string): string => {
  const prefix = parsed.variants.length > 0 ? `${parsed.variants.join(":")}:` : "";
  const neg = parsed.negative ? "-" : "";
  return `${prefix}${neg}${parsed.utility}-${valueOverride}`;
};

const formatSuggestion = (raw: string, suggestedRaw: string): string =>
  `tailwind token suggestion: ${raw} -> ${suggestedRaw}`;

/**
 * Decide whether a parsed class is a token-bearing Tailwind utility the adapter
 * should emit a candidate for. Bare utilities (`flex`, `block`) and arbitrary
 * values on unknown utilities are excluded.
 */
export const isTokenBearing = (
  parsed: ParsedClassName,
  registry: TailwindTokenRegistry,
): boolean => {
  if (parsed.value !== undefined) {
    return registry.lookup(parsed.utility, parsed.value) !== undefined;
  }
  // Arbitrary-value form: recognized iff the utility is a known arbitrary host.
  if (parsed.arbitrary !== undefined) {
    return isKnownArbitraryUtility(parsed.utility);
  }
  return false;
};

const ARBITRARY_UTILITIES: ReadonlySet<string> = new Set([
  "gap",
  "gap-x",
  "gap-y",
  "p",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "m",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "w",
  "h",
  "min-w",
  "min-h",
  "max-w",
  "max-h",
  "inset",
  "inset-x",
  "inset-y",
  "top",
  "right",
  "bottom",
  "left",
  "text",
  "bg",
  "border",
  "translate-x",
  "translate-y",
  "grid-cols",
  "grid-rows",
  "rounded",
]);

const isKnownArbitraryUtility = (utility: string): boolean => ARBITRARY_UTILITIES.has(utility);

/**
 * Build a single {@link SourceCandidate} for one className. Returns `undefined`
 * when the class is not a token-bearing Tailwind utility.
 */
export const buildTailwindCandidate = (
  input: TailwindCandidateInput,
): SourceCandidate | undefined => {
  const { className, parsed, registry, origin, runtimeInstanceCount, conflictPeers } = input;
  if (!isTokenBearing(parsed, registry)) return undefined;

  const warnings: string[] = [];
  if (runtimeInstanceCount > 1) {
    warnings.push(
      `repeated instance ambiguity: ${runtimeInstanceCount} elements share this className; source origin may not match the selected instance`,
    );
  }
  if (conflictPeers.length > 0) {
    warnings.push(
      `token conflict: "${className}" conflicts with ${conflictPeers.map((c) => `"${c}"`).join(", ")} on the same property`,
    );
  }

  // STATIC origin -> HIGH via ast-origin + source range + suggestion.
  if (origin?.isStatic) {
    const suggestion = suggestReplacement(parsed, registry);
    const snippetParts = [formatSuggestion(className, suggestion)];
    return candidate({
      staticClassName: className,
      workspaceRelativePath: origin.workspaceRelativePath,
      startLine: origin.startLine,
      startColumn: origin.startColumn,
      endLine: origin.endLine,
      endColumn: origin.endColumn,
      confidence: "high",
      evidence: [...AST_ORIGIN_EVIDENCE],
      ownershipRisk: conflictPeers.length > 0 ? "medium" : "low",
      snippet: snippetParts.join("\n"),
      warnings,
    });
  }

  // DYNAMIC origin (conditional/template/identifier literal) -> MEDIUM, agent-required.
  if (origin !== undefined && !origin.isStatic) {
    warnings.push(
      "agent-required: className origin is a dynamic expression (conditional/template); source location unverified at runtime",
    );
    return candidate({
      staticClassName: className,
      workspaceRelativePath: origin.workspaceRelativePath,
      startLine: origin.startLine,
      startColumn: origin.startColumn,
      endLine: origin.endLine,
      endColumn: origin.endColumn,
      confidence: "medium",
      evidence: [...AST_ORIGIN_EVIDENCE],
      ownershipRisk: "high",
      warnings,
    });
  }

  // NO origin located -> the runtime class is real but its source is unverified.
  warnings.push(
    "agent-required: className token not located in configured source files; origin inferred, not proven",
  );
  const confidence: Confidence = conflictPeers.length > 0 ? "low" : "medium";
  return candidate({
    staticClassName: className,
    confidence,
    evidence: [...TEXT_SEARCH_EVIDENCE],
    ownershipRisk: "medium",
    warnings,
  });
};

/** Compute the nearest-token replacement string for a token-bearing class. */
const suggestReplacement = (parsed: ParsedClassName, registry: TailwindTokenRegistry): string => {
  if (parsed.value !== undefined) {
    const nearest: TailwindToken | undefined = registry.suggestNearest(
      parsed.utility,
      parsed.value,
    );
    if (nearest !== undefined) {
      return rebuildClassName(parsed, nearest.key);
    }
  }
  // Arbitrary value or no nearest token: echo the raw (no deterministic suggestion).
  return parsed.raw;
};
