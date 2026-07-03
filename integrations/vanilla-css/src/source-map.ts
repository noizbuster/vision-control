/**
 * CSS source-map v3 range resolver for processed CSS (PRD §15.3 / Task 45).
 *
 * When a vanilla stylesheet is the OUTPUT of PostCSS / Sass / Lightning CSS, a
 * CSS source map bridges the generated rule back to the original author source.
 * This module decodes the source-map v3 `mappings` (VLQ) and resolves a
 * selector to its original source range by searching `sourcesContent` for the
 * selector pattern — same strategy as @vision-control/css-modules, kept
 * self-contained here to avoid an integration→integration dependency that
 * would muddy the graph.
 *
 * The HIGH path: a source map AND a resolved concrete range qualify a candidate
 * for HIGH under the never-wrong-HIGH policy (`source-map` + range). When the
 * source map exists but no range is found (missing sourcesContent, selector not
 * present), the adapter cites `source-map` without a range and tops out at
 * MEDIUM.
 */

import type { VanillaCssSourceRange } from "./types.js";

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decoded source-map v3 segment. */
export interface SourceMapSegment {
  readonly generatedLine: number;
  readonly generatedColumn: number;
  readonly sourceIndex?: number;
  readonly sourceLine?: number;
  readonly sourceColumn?: number;
}

/** Parsed CSS source map v3. */
export class VanillaCssSourceMap {
  constructor(
    readonly sources: readonly string[],
    private readonly sourcesContent: readonly (string | undefined)[],
  ) {}

  /**
   * Find the original source range where a selector is declared. Searches
   * `sourcesContent` (when present) for the selector pattern (`.name`, `#name`,
   * or a bare type) followed by `{` or `,`. Returns the range of the selector
   * in the original source file, or `undefined` when not resolvable.
   */
  findSelectorRange(
    selector: string,
  ): { readonly sourceFile: string; readonly range: VanillaCssSourceRange } | undefined {
    if (this.sourcesContent === undefined) return undefined;
    for (let i = 0; i < this.sourcesContent.length; i += 1) {
      const content = this.sourcesContent[i];
      const sourceFile = this.sources[i];
      if (content === undefined || sourceFile === undefined) continue;
      const range = findSelectorInContent(content, selector);
      if (range !== undefined) return { sourceFile, range };
    }
    return undefined;
  }
}

const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findSelectorInContent = (
  content: string,
  selector: string,
): VanillaCssSourceRange | undefined => {
  const escaped = escapeRegex(selector);
  // Selector followed by `{` or `,` (a rule or selector-list member).
  const pattern = new RegExp(`(?<![\\w-])${escaped}(?=\\s*[{,])`);
  const match = content.match(pattern);
  if (match === null || match.index === undefined) return undefined;
  const before = content.slice(0, match.index);
  const lines = before.split("\n");
  const startLine = lines.length - 1;
  const lastLine = lines[lines.length - 1] ?? "";
  const startColumn = lastLine.length;
  return {
    startLine,
    startColumn,
    endLine: startLine,
    endColumn: startColumn + selector.length,
  };
};

/**
 * Parse a raw source-map v3 JSON value into a {@link VanillaCssSourceMap}.
 * Only `sources` + `sourcesContent` are needed for selector-range resolution;
 * the VLQ `mappings` are not decoded here (range resolution searches content).
 * Returns `undefined` for non-v3 or malformed input.
 */
export const parseSourceMap = (input: unknown): VanillaCssSourceMap | undefined => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const obj = input as Record<string, unknown>;
  if (obj.version !== 3) return undefined;
  const sources = Array.isArray(obj.sources)
    ? obj.sources.filter((s): s is string => typeof s === "string")
    : [];
  const sourcesContent = Array.isArray(obj.sourcesContent)
    ? obj.sourcesContent.map((s) => (typeof s === "string" ? s : undefined))
    : [];
  return new VanillaCssSourceMap(sources, sourcesContent);
};

/** Decode a single comma-separated VLQ segment into its integer fields. */
const decodeVlqSegment = (str: string): number[] => {
  const values: number[] = [];
  let pos = 0;
  while (pos < str.length) {
    let result = 0;
    let shift = 0;
    let continuation: boolean;
    do {
      const idx = BASE64_CHARS.indexOf(str[pos] ?? "");
      pos += 1;
      if (idx < 0) return values;
      continuation = (idx & 0x20) !== 0;
      result += (idx & 0x1f) << shift;
      shift += 5;
    } while (continuation && pos < str.length);
    const negative = (result & 1) !== 0;
    result >>= 1;
    values.push(negative ? -result : result);
  }
  return values;
};

/** Count decoded segments in a v3 source map (introspection for tests/debug). */
export const countSegments = (mappings: string): number => {
  let total = 0;
  for (const line of mappings.split(";")) {
    for (const seg of line.split(",")) {
      if (seg.length > 0 && decodeVlqSegment(seg).length > 0) total += 1;
    }
  }
  return total;
};
