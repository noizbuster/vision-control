/**
 * Source-candidate production for CSS Modules (VC-V1V2-12).
 *
 * Given a runtime hashed class name and optional manifest/source-map data, this
 * module produces zero or more source candidates following the never-wrong-HIGH
 * policy:
 *
 * - **Manifest + source-map + range → HIGH.** The hashed class resolves through
 *   the manifest to a local name, the source map pinpoints the original source
 *   range. Evidence: `["manifest", "source-map"]` + range → qualifies for HIGH.
 * - **Manifest alone → MEDIUM.** The hashed class resolves to a local name and
 *   module path, but no source range is available. Evidence: `["manifest"]`.
 * - **Hash heuristic only → MEDIUM/LOW.** No manifest; the class name matches a
 *   CSS Modules hash pattern. Evidence: `["text-search"]` (never HIGH). Returns
 *   an "agent-required" warning.
 * - **No match → empty.** The class does not look like a CSS Modules hashed name.
 */

import { type ComposedCandidate, traceComposition } from "./composition.js";
import { detectHashHeuristic } from "./hash-heuristic.js";
import type { CssModulesManifest } from "./manifest.js";
import type { CssSourceMap } from "./source-map.js";
import type { Confidence, ConfidenceEvidence, SourceCandidate } from "./types.js";

export interface CandidateProducerData {
  readonly manifest?: CssModulesManifest;
  readonly sourceMaps?: ReadonlyMap<string, CssSourceMap>;
}

/**
 * Produce all source candidates for a single runtime hashed class.
 *
 * The adapter calls this for each CSS class on the element.
 */
export const produceCandidates = (
  hashedClass: string,
  data: CandidateProducerData,
): readonly SourceCandidate[] => {
  const { manifest, sourceMaps } = data;
  const candidates: SourceCandidate[] = [];

  if (manifest !== undefined) {
    const composed = traceComposition(hashedClass, manifest);
    for (const cc of composed) {
      candidates.push(buildManifestCandidate(cc, sourceMaps));
    }
  }

  if (candidates.length === 0) {
    const heuristic = detectHashHeuristic(hashedClass);
    if (heuristic.matched) {
      candidates.push(buildHeuristicCandidate(hashedClass, heuristic));
    }
  }

  return candidates;
};

const buildManifestCandidate = (
  cc: ComposedCandidate,
  sourceMaps?: ReadonlyMap<string, CssSourceMap>,
): SourceCandidate => {
  const evidence: ConfidenceEvidence[] = ["manifest"];
  let confidence: Confidence = "medium";
  const warnings: string[] = [];

  if (cc.isComposedTarget) {
    warnings.push("composed class: resolved via composes chain from primary declaration");
  }

  let sourceMap = sourceMaps?.get(cc.modulePath);
  if (sourceMap === undefined) {
    // Fall back: try matching by basename or partial path.
    sourceMap = resolveSourceMapByModule(cc.modulePath, sourceMaps);
  }

  if (sourceMap !== undefined) {
    evidence.push("source-map");
    const range = sourceMap.findClassDeclaration(cc.localName);
    if (range !== undefined) {
      confidence = "high";
      return makeCandidate({
        confidence,
        evidence,
        warnings,
        staticClassName: cc.hashedName,
        workspaceRelativePath: range.sourceFile,
        startLine: range.startLine,
        startColumn: range.startColumn,
        endLine: range.endLine,
        endColumn: range.endColumn,
        cssFilePath: range.sourceFile,
        cssLine: range.startLine + 1,
        ownershipRisk: cc.isComposedTarget ? "medium" : "low",
      });
    }
    warnings.push("source map present but class declaration range not resolved");
  }

  return makeCandidate({
    confidence,
    evidence,
    warnings,
    staticClassName: cc.hashedName,
    cssFilePath: cc.modulePath,
    ownershipRisk: cc.isComposedTarget ? "medium" : "low",
  });
};

const buildHeuristicCandidate = (
  hashedClass: string,
  heuristic: { readonly confidence: "medium" | "low"; readonly localNameGuess?: string },
): SourceCandidate => {
  const warnings = [
    "agent-required: hashed CSS module class resolved by name heuristic only — no manifest or source map proof",
  ];
  if (heuristic.localNameGuess !== undefined) {
    warnings.push(`inferred local name: ${heuristic.localNameGuess}`);
  }
  return makeCandidate({
    confidence: heuristic.confidence,
    evidence: ["text-search"],
    warnings,
    staticClassName: hashedClass,
    ownershipRisk: "medium",
  });
};

/**
 * Attempt to find a source map for a module path when the exact key is not in
 * the map. Tries basename matching as a fallback.
 */
const resolveSourceMapByModule = (
  modulePath: string,
  sourceMaps?: ReadonlyMap<string, CssSourceMap>,
): CssSourceMap | undefined => {
  if (sourceMaps === undefined) return undefined;
  if (sourceMaps.has(modulePath)) return sourceMaps.get(modulePath);
  const basename = modulePath.split("/").pop() ?? modulePath;
  for (const [key, sm] of sourceMaps) {
    const keyBase = key.split("/").pop() ?? key;
    if (keyBase === basename) return sm;
  }
  return undefined;
};

/**
 * Construct a SourceCandidate plain object with conditional-spread for optional
 * fields (exactOptionalPropertyTypes compliance). No runtime import of
 * createSourceCandidate needed — the Zod schema validates at the resolver
 * boundary, and this object is structurally identical.
 */
const makeCandidate = (fields: {
  readonly confidence: Confidence;
  readonly evidence: readonly ConfidenceEvidence[];
  readonly warnings: string[];
  readonly staticClassName: string;
  readonly ownershipRisk: "none" | "low" | "medium" | "high";
  readonly workspaceRelativePath?: string;
  readonly startLine?: number;
  readonly startColumn?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly cssFilePath?: string;
  readonly cssLine?: number;
}): SourceCandidate => ({
  confidence: fields.confidence,
  evidence: [...fields.evidence],
  warnings: [...fields.warnings],
  staticClassName: fields.staticClassName,
  ownershipRisk: fields.ownershipRisk,
  ...(fields.workspaceRelativePath !== undefined
    ? { workspaceRelativePath: fields.workspaceRelativePath }
    : {}),
  ...(fields.startLine !== undefined ? { startLine: fields.startLine } : {}),
  ...(fields.startColumn !== undefined ? { startColumn: fields.startColumn } : {}),
  ...(fields.endLine !== undefined ? { endLine: fields.endLine } : {}),
  ...(fields.endColumn !== undefined ? { endColumn: fields.endColumn } : {}),
  ...(fields.cssFilePath !== undefined ? { cssFilePath: fields.cssFilePath } : {}),
  ...(fields.cssLine !== undefined ? { cssLine: fields.cssLine } : {}),
});
