/**
 * Lightweight vanilla CSS parser (PRD §15.3 / Task 45).
 *
 * Parses a stylesheet into rules carrying the PRD §15.3 metadata: the selector
 * list, declarations, source range of the selector, enclosing @layer cascade
 * layer, enclosing @media media query, and any CSS custom-property (--var)
 * declarations. Source ranges are 0-based line/column.
 *
 * Scope: handles the common author-CSS constructs the adapter must resolve —
 * plain rules, @layer blocks, @media blocks, :root custom-property blocks, and
 * at-statements (@import/@charset). At-rules whose blocks are NOT rule
 * containers (@keyframes, @font-face) are skipped as balanced blocks so their
 * inner punctuation is never misread as selectors. CSS Nesting (a rule body
 * containing another rule) is not supported; such input degrades to the outer
 * rule only. The resolver's never-wrong-HIGH policy is unaffected because a
 * concrete selector range still qualifies a HIGH candidate.
 */

import type { VanillaCssSourceRange } from "./types.js";

/** One parsed CSS rule with full PRD §15.3 metadata. */
export interface ParsedRule {
  /** Full selector list text, e.g. "a, .btn, #x". */
  readonly selectorList: string;
  /** Declarations on the rule, property → value (trimmed, first-colon split). */
  readonly declarations: ReadonlyMap<string, string>;
  /** Source range of the selector list within the stylesheet (0-based). */
  readonly range: VanillaCssSourceRange;
  /** Cascade layer name when inside @layer, else undefined. */
  readonly cascadeLayer?: string;
  /** Media query text when inside @media, else undefined. */
  readonly mediaQuery?: string;
}

/** A CSS custom-property (--var) declaration found in the stylesheet. */
export interface ParsedCustomProperty {
  readonly name: string;
  readonly value: string;
  readonly range: VanillaCssSourceRange;
  readonly cascadeLayer?: string;
}

export interface ParsedStyleSheet {
  readonly url: string;
  readonly rules: readonly ParsedRule[];
  readonly customProperties: readonly ParsedCustomProperty[];
}

/** Replace comment characters with spaces (newlines preserved) to keep indices. */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** Line starts index table for O(log n) line/column lookup. */
const computeLineStarts = (text: string): number[] => {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
};

const indexToLineCol = (lineStarts: number[], index: number): { line: number; column: number } => {
  // Binary search for the greatest lineStart <= index.
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const start = lineStarts[mid];
    if (start !== undefined && start <= index) lo = mid;
    else hi = mid - 1;
  }
  const lineStart = lineStarts[lo] ?? 0;
  return { line: lo, column: index - lineStart };
};

const rangeOf = (
  lineStarts: number[],
  startIndex: number,
  endIndex: number,
): VanillaCssSourceRange => {
  const start = indexToLineCol(lineStarts, startIndex);
  const end = indexToLineCol(lineStarts, endIndex);
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
};

interface AtContext {
  readonly kind: "layer" | "media";
  readonly value: string;
}

/** Parse an @-rule prelude into a context (layer/media), or undefined to skip. */
const parseAtPrelude = (prelude: string): AtContext | undefined => {
  const match = prelude.match(/^@([a-z-]+)\s*(.*)$/s);
  if (match === null) return undefined;
  const keyword = match[1] ?? "";
  const rest = (match[2] ?? "").trim();
  if (keyword === "layer") {
    // @layer with no name is anonymous; record as empty layer marker.
    return { kind: "layer", value: rest };
  }
  if (keyword === "media") {
    return { kind: "media", value: rest };
  }
  return undefined;
};

/** Skip a balanced { } block starting just AFTER an opening brace. */
const skipBalancedBlock = (text: string, i: number): number => {
  let depth = 1;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    i += 1;
  }
  return i; // index just after the closing brace
};

const currentLayer = (stack: readonly AtContext[]): string | undefined => {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const ctx = stack[i];
    if (ctx?.kind === "layer") return ctx.value.length > 0 ? ctx.value : "";
  }
  return undefined;
};

const currentMedia = (stack: readonly AtContext[]): string | undefined => {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const ctx = stack[i];
    if (ctx?.kind === "media") return ctx.value;
  }
  return undefined;
};

/** Parse declarations between an opening brace and its closing brace. */
const parseDeclarations = (body: string): ReadonlyMap<string, string> => {
  const decls = new Map<string, string>();
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const prop = part.slice(0, colon).trim();
    const value = part.slice(colon + 1).trim();
    if (prop.length === 0) continue;
    decls.set(prop, value);
  }
  return decls;
};

/**
 * Parse a stylesheet into rules + custom properties. Never throws: malformed
 * input degrades to an empty (or partial) result so the adapter can fall back
 * gracefully.
 */
export const parseStyleSheet = (rawText: string, url: string): ParsedStyleSheet => {
  const text = stripComments(rawText);
  const lineStarts = computeLineStarts(text);
  const rules: ParsedRule[] = [];
  const customProperties: ParsedCustomProperty[] = [];
  const stack: AtContext[] = [];

  let i = 0;
  while (i < text.length) {
    // Skip whitespace.
    while (i < text.length && /\s/.test(text[i] ?? "")) i += 1;
    if (i >= text.length) break;

    const ch = text[i];
    if (ch === "}") {
      // Close a nesting context.
      if (stack.length > 0) stack.pop();
      i += 1;
      continue;
    }

    // Read prelude up to '{' or ';'.
    const preludeStart = i;
    while (i < text.length && text[i] !== "{" && text[i] !== ";") i += 1;
    if (i >= text.length) break;
    const preludeEnd = i;
    const preludeRaw = text.slice(preludeStart, preludeEnd);
    const prelude = preludeRaw.trim();
    const trimmedLeading = preludeRaw.length - preludeRaw.trimStart().length;

    if (text[i] === ";") {
      // At-statement without a block (@import/@charset/@namespace) — skip.
      i += 1;
      continue;
    }

    // text[i] === "{" — a block follows.
    if (prelude.startsWith("@")) {
      const ctx = parseAtPrelude(prelude);
      i += 1; // consume '{'
      if (ctx !== undefined) {
        stack.push(ctx);
      } else {
        // Unknown at-rule block (e.g. @keyframes, @font-face) — skip entirely.
        i = skipBalancedBlock(text, i);
      }
      continue;
    }

    if (prelude.length === 0) {
      // Empty selector (stray '{'); skip the block to stay aligned.
      i = skipBalancedBlock(text, i + 1);
      continue;
    }

    // Regular rule: selector list { declarations }.
    const selectorEnd = preludeStart + trimmedLeading + prelude.length;
    const selectorRange = rangeOf(lineStarts, preludeStart + trimmedLeading, selectorEnd);
    i += 1; // consume '{'
    const bodyStart = i;
    const bodyEnd = text.indexOf("}", bodyStart);
    const bodyEndIndex = bodyEnd < 0 ? text.length : bodyEnd;
    const body = text.slice(bodyStart, bodyEndIndex);
    const decls = parseDeclarations(body);
    const layer = currentLayer(stack);
    const media = currentMedia(stack);
    rules.push({
      selectorList: prelude,
      declarations: decls,
      range: selectorRange,
      ...(layer !== undefined && layer.length > 0 ? { cascadeLayer: layer } : {}),
      ...(media !== undefined ? { mediaQuery: media } : {}),
    });

    // Collect custom properties from this rule for the custom-property origin.
    for (const [prop, value] of decls) {
      if (prop.startsWith("--")) {
        // Per-declaration range is approximated by the selector range + offset
        // (precise per-declaration ranges are out of MVP scope).
        customProperties.push({
          name: prop,
          value,
          range: selectorRange,
          ...(layer !== undefined && layer.length > 0 ? { cascadeLayer: layer } : {}),
        });
      }
    }

    i = bodyEndIndex + 1; // past '}'
  }

  return { url, rules, customProperties };
};
