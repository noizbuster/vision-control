/**
 * CSS-in-JS source adapter (VC-V1V2-20 / PRD 15.4-15.5).
 *
 * Maps a runtime CSS-in-JS generated class name (styled-components `sc-*`,
 * emotion `css-*`, stitches hash names) to its source origin.
 *
 * **Static extractable case (deterministic):** when a registry has located the
 * style definition for a class and {@link ./static-extraction.ts} confirms it
 * is a fully-literal definition, the adapter returns a HIGH candidate backed
 * by `ast-origin` evidence and a concrete source range. This is the only path
 * that may claim HIGH, and it is honest: the definition is AST-owned.
 *
 * **Dynamic / runtime-generated case (agent-required):** when the definition
 * contains interpolation, computed keys, member access, spreads, or function
 * calls, the values are runtime-generated. The adapter returns a MEDIUM/LOW
 * candidate with `text-search` evidence and an "agent-required" warning. No
 * deterministic patch is suggested. The adapter NEVER marks a dynamic
 * runtime-generated class as HIGH.
 *
 * **Heuristic singleton:** the exported {@link CSS_IN_JS_ADAPTER} has no
 * registry loaded and falls back to generated-name detection, returning
 * MEDIUM advisory candidates only. Callers with a definition registry should
 * use {@link createCssInJsAdapter}.
 *
 * Confidence policy is never-wrong-HIGH compliant by construction: the static
 * path cites `ast-origin` (solo-strong) + a range, which qualifies; the dynamic
 * path cites only `text-search`, which never qualifies for HIGH.
 */

import type { AdapterContext, SourceAdapter } from "../adapter-contract.js";
import { createSourceCandidate, type SourceCandidate } from "../source-candidate.js";
import { type CssInJsDefinition, extractStaticStyles } from "./static-extraction.js";

/** Map of runtime class name -> located style definition. */
export interface CssInJsAdapterData {
  readonly definitions?: ReadonlyMap<string, CssInJsDefinition>;
}

/** Result of generated-class-name detection (the singleton heuristic fallback). */
export interface CssInJsHeuristicResult {
  readonly matched: boolean;
  readonly flavor: CssInJsDefinition["flavor"];
  readonly confidence: "medium" | "low";
}

const AGENT_REQUIRED_DYNAMIC =
  "agent-required: CSS-in-JS definition is runtime-generated (interpolation/computed) — no deterministic patch";
const AGENT_REQUIRED_HEURISTIC =
  "agent-required: CSS-in-JS generated class resolved by name heuristic only — no definition registry proof";

/**
 * Detect whether a class name looks like a CSS-in-JS generated name. Returns a
 * flavor guess and a conservative confidence. This is the LAST-RESORT path for
 * the bare singleton; it NEVER produces HIGH.
 */
export const detectCssInJsHeuristic = (className: string): CssInJsHeuristicResult => {
  // styled-components: sc-<key><hash>
  if (/^sc-[a-z0-9]+$/i.test(className)) {
    return { matched: true, flavor: "styled-components", confidence: "medium" };
  }
  // emotion: css-<hash>, emotion-<n>, em-<n>; also the hash-only emotion output.
  if (/^(css|emotion|em)-[a-z0-9]+$/i.test(className)) {
    return { matched: true, flavor: "emotion", confidence: "medium" };
  }
  // Generic generated-name pattern: <prefix>-<hash> where the suffix contains
  // at least one digit (real build hashes do; real-word suffixes like "button"
  // do not). Low confidence to avoid false positives on utility classes.
  if (/^[a-z]+-[a-z0-9]*\d[a-z0-9]*$/i.test(className) && className.length >= 8) {
    return { matched: true, flavor: "unknown", confidence: "low" };
  }
  return { matched: false, flavor: "unknown", confidence: "low" };
};

/**
 * Factory: create a CSS-in-JS source adapter with an injected definition
 * registry. Callers that have located style definitions (via a workspace AST
 * walk) should use this instead of the bare {@link CSS_IN_JS_ADAPTER}.
 */
export const createCssInJsAdapter = (data: CssInJsAdapterData = {}): SourceAdapter => ({
  id: "css-in-js",
  description:
    "CSS-in-JS source resolution (styled-components/emotion/stitches static extraction; dynamic is agent-required)",
  resolve: (context: AdapterContext): readonly SourceCandidate[] => {
    const classes = context.cssClasses;
    if (classes === undefined || classes.length === 0) return [];

    const definitions = data.definitions;
    const candidates: SourceCandidate[] = [];

    for (const className of classes) {
      if (definitions !== undefined) {
        const definition = definitions.get(className);
        if (definition !== undefined) {
          const candidate = buildRegistryCandidate(className, definition);
          if (candidate !== null) candidates.push(candidate);
          continue;
        }
      }
      // Fallback: generated-name heuristic.
      const heuristic = detectCssInJsHeuristic(className);
      if (heuristic.matched) {
        candidates.push(buildHeuristicCandidate(className, heuristic));
      }
    }

    return candidates;
  },
});

const buildRegistryCandidate = (
  className: string,
  definition: CssInJsDefinition,
): SourceCandidate | null => {
  const extraction = extractStaticStyles(definition);

  if (extraction.isStatic) {
    // Deterministic: AST-owned literal definition. ast-origin is solo-strong
    // for HIGH, and we carry a concrete source range.
    return createSourceCandidate({
      staticClassName: className,
      workspaceRelativePath: definition.workspaceRelativePath,
      startLine: definition.startLine,
      startColumn: definition.startColumn,
      endLine: definition.endLine,
      endColumn: definition.endColumn,
      ...(definition.componentName !== undefined
        ? { componentName: definition.componentName }
        : {}),
      snippet: renderSnippet(extraction.declarations),
      confidence: "high",
      evidence: ["ast-origin"],
      warnings: [],
      ownershipRisk: "low",
    });
  }

  // Dynamic: runtime-generated values. Agent-required, never HIGH.
  return createSourceCandidate({
    staticClassName: className,
    workspaceRelativePath: definition.workspaceRelativePath,
    ...(definition.componentName !== undefined ? { componentName: definition.componentName } : {}),
    confidence: "medium",
    evidence: ["text-search"],
    warnings: [AGENT_REQUIRED_DYNAMIC, `dynamic reason: ${extraction.dynamicReason ?? "unknown"}`],
    ownershipRisk: "high",
  });
};

const buildHeuristicCandidate = (
  className: string,
  heuristic: CssInJsHeuristicResult,
): SourceCandidate => {
  const warnings = [
    AGENT_REQUIRED_HEURISTIC,
    `inferred flavor: ${heuristic.flavor}`,
    "generated class names are unstable across builds",
  ];
  return createSourceCandidate({
    staticClassName: className,
    confidence: heuristic.confidence,
    evidence: ["text-search"],
    warnings,
    ownershipRisk: "high",
  });
};

const renderSnippet = (
  declarations: readonly { readonly property: string; readonly value: string }[],
): string => {
  if (declarations.length === 0) return "";
  return declarations.map((d) => `  ${d.property}: ${d.value};`).join("\n");
};

/**
 * Default singleton adapter — no definition registry loaded.
 *
 * Falls back to generated-name heuristics. Returns MEDIUM/LOW advisory
 * candidates with "agent-required" warnings, NEVER HIGH. Callers with a
 * definition registry should use {@link createCssInJsAdapter}.
 */
export const CSS_IN_JS_ADAPTER: SourceAdapter = createCssInJsAdapter();
