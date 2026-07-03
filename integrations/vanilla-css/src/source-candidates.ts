/**
 * Source-candidate production for vanilla CSS (PRD §15.3 / Task 45).
 *
 * Given the element's runtime CSS classes and parsed stylesheets, this module
 * finds the rules whose selectors match each class and produces source
 * candidates with full PRD §15.3 metadata. Confidence follows the
 * never-wrong-HIGH policy:
 *
 * - **Author stylesheet text → HIGH.** The stylesheet source is parsed to a
 *   concrete selector range → `ast-origin` evidence (AST analysis pins the
 *   source location). `ast-origin` is a solo-strong method → HIGH.
 * - **Processed CSS source map → HIGH.** When a CSS source map resolves a
 *   concrete range for processed output → `source-map` + range → HIGH.
 * - **Stylesheet URL known but no content/range → MEDIUM.** Only the stylesheet
 *   is identified, no range pinned (no qualifying evidence for HIGH).
 *
 * Multiple matching rules produce multiple candidates; the resolver ranks them.
 */

import type { VanillaCssSourceMap } from "./source-map.js";
import { computeSpecificity } from "./specificity.js";
import type { ParsedCustomProperty, ParsedRule, ParsedStyleSheet } from "./stylesheet.js";
import type { CustomPropertyOrigin, SourceCandidate } from "./types.js";

export interface VanillaCssAdapterData {
  readonly stylesheets?: readonly ParsedStyleSheet[];
  /** Source maps keyed by stylesheet URL (workspace-relative), for processed CSS. */
  readonly sourceMaps?: ReadonlyMap<string, VanillaCssSourceMap>;
}

const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does the rule's selector list match the given class? A class matches when a
 * `.className` token appears as a compound selector (not followed by another
 * ident char) in any member of the selector list.
 */
const ruleMatchesClass = (rule: ParsedRule, className: string): boolean => {
  const re = new RegExp(`\\.${escapeRegex(className)}(?![\\w-])`);
  return re.test(rule.selectorList);
};

/** Extract `--var` references from a declaration value, e.g. var(--primary). */
const VAR_REF_RE = /var\(\s*(--[\w-]+)/g;

const extractVarRefs = (decls: ReadonlyMap<string, string>): readonly string[] => {
  const refs = new Set<string>();
  for (const value of decls.values()) {
    for (const m of value.matchAll(VAR_REF_RE)) {
      const name = m[1];
      if (name !== undefined) refs.add(name);
    }
  }
  return [...refs];
};

/** Find the first custom-property declaration with the given name. */
const findCustomProperty = (
  stylesheets: readonly ParsedStyleSheet[],
  name: string,
): ParsedCustomProperty | undefined => {
  for (const sheet of stylesheets) {
    for (const cp of sheet.customProperties) {
      if (cp.name === name) return cp;
    }
  }
  return undefined;
};

const buildCustomPropertyOrigin = (
  matchedRule: ParsedRule,
  data: VanillaCssAdapterData,
): CustomPropertyOrigin | undefined => {
  const stylesheets = data.stylesheets ?? [];
  const refs = extractVarRefs(matchedRule.declarations);
  for (const name of refs) {
    const cp = findCustomProperty(stylesheets, name);
    if (cp !== undefined) {
      return {
        name: cp.name,
        value: cp.value,
        stylesheetUrl: stylesheets.find((s) => s.customProperties.includes(cp))?.url ?? "",
        range: cp.range,
        ...(cp.cascadeLayer !== undefined ? { cascadeLayer: cp.cascadeLayer } : {}),
      };
    }
  }
  return undefined;
};

/**
 * Produce all source candidates for the element's classes across the loaded
 * stylesheets. The adapter calls this once per resolution request.
 */
export const produceCandidates = (
  cssClasses: readonly string[],
  data: VanillaCssAdapterData,
): readonly SourceCandidate[] => {
  const stylesheets = data.stylesheets ?? [];
  if (cssClasses.length === 0 || stylesheets.length === 0) return [];

  const candidates: SourceCandidate[] = [];
  for (const className of cssClasses) {
    for (const sheet of stylesheets) {
      for (const rule of sheet.rules) {
        if (!ruleMatchesClass(rule, className)) continue;
        const candidate = buildCandidate(className, rule, sheet, data);
        candidates.push(candidate);
      }
    }
  }
  return candidates;
};

const buildCandidate = (
  className: string,
  rule: ParsedRule,
  sheet: ParsedStyleSheet,
  data: VanillaCssAdapterData,
): SourceCandidate => {
  const warnings: string[] = [];
  const specificity = computeSpecificity(rule.selectorList);

  // Prefer a processed-CSS source map when present; otherwise the stylesheet
  // IS the source and AST parsing pins the range.
  const sourceMap = data.sourceMaps?.get(sheet.url);
  let evidence: SourceCandidate["evidence"];
  let workspaceRelativePath: string | undefined;
  let range:
    | { startLine: number; startColumn: number; endLine: number; endColumn: number }
    | undefined;
  let cssFilePath: string | undefined;

  if (sourceMap !== undefined) {
    const resolved = sourceMap.findSelectorRange(rule.selectorList);
    if (resolved !== undefined) {
      evidence = ["source-map"];
      workspaceRelativePath = resolved.sourceFile;
      range = resolved.range;
      cssFilePath = resolved.sourceFile;
    } else {
      evidence = ["source-map", "text-search"];
      warnings.push("source map present but selector range not resolved in sourcesContent");
      workspaceRelativePath = sheet.url;
      cssFilePath = sheet.url;
    }
  } else {
    // Author stylesheet: AST parse of the source text pinned the range.
    evidence = ["ast-origin"];
    workspaceRelativePath = sheet.url;
    range = rule.range;
    cssFilePath = sheet.url;
  }

  if (rule.cascadeLayer !== undefined) {
    warnings.push(`cascade layer: ${rule.cascadeLayer}`);
  }
  if (rule.mediaQuery !== undefined) {
    warnings.push(`media query: ${rule.mediaQuery}`);
  }

  const customPropertyOrigin = buildCustomPropertyOrigin(rule, data);

  // Confidence follows the never-wrong-HIGH policy: HIGH only when a concrete
  // source range is pinned (ast-origin on author CSS, or source-map + range on
  // processed CSS). Without a range the candidate tops out at MEDIUM; the
  // resolver's enforceNeverWrongHigh is the backstop.
  const confidence: SourceCandidate["confidence"] = range !== undefined ? "high" : "medium";

  return {
    confidence,
    evidence: [...evidence],
    warnings,
    staticClassName: className,
    ownershipRisk: rule.mediaQuery !== undefined ? "medium" : "low",
    ...(workspaceRelativePath !== undefined ? { workspaceRelativePath } : {}),
    ...(range !== undefined
      ? {
          startLine: range.startLine,
          startColumn: range.startColumn,
          endLine: range.endLine,
          endColumn: range.endColumn,
        }
      : {}),
    ...(cssFilePath !== undefined ? { cssFilePath } : {}),
    cssLine: rule.range.startLine + 1,
    matchedSelector: rule.selectorList,
    specificity,
    ...(rule.cascadeLayer !== undefined ? { cascadeLayer: rule.cascadeLayer } : {}),
    ...(rule.mediaQuery !== undefined ? { mediaQuery: rule.mediaQuery } : {}),
    ...(customPropertyOrigin !== undefined ? { customPropertyOrigin } : {}),
  };
};
