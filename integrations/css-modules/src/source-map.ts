/**
 * CSS source-map v3 parsing and class-declaration resolution (VC-V1V2-12).
 *
 * Given a CSS source map (the `.css.map` JSON produced by css-loader / Vite /
 * PostCSS), this module:
 * 1. Decodes the VLQ-encoded `mappings` field into structured segments.
 * 2. Resolves a LOCAL class declaration to its original source range by
 *    searching `sourcesContent` (when present) for the `.{className}` selector
 *    pattern.
 *
 * When the source map is present AND a concrete range is resolved, the adapter
 * cites `source-map` + `range` evidence → HIGH confidence (per the
 * never-wrong-HIGH policy). When the source map exists but no range is found
 * (missing `sourcesContent`, class not in content), the adapter cites
 * `source-map` without a range → MEDIUM at best.
 */

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** A single decoded source-map segment (1, 4, or 5 VLQ fields). */
export interface SourceMapSegment {
  readonly generatedLine: number;
  readonly generatedColumn: number;
  readonly sourceIndex?: number;
  readonly sourceLine?: number;
  readonly sourceColumn?: number;
  readonly nameIndex?: number;
}

/** A resolved source range for a class declaration. */
export interface ResolvedRange {
  readonly sourceFile: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

/** Parsed CSS source map v3. */
export class CssSourceMap {
  constructor(
    readonly sources: readonly string[],
    private readonly segments: readonly (readonly SourceMapSegment[])[],
    readonly sourcesContent?: readonly (string | undefined)[],
  ) {}

  /**
   * Find the original source range where a LOCAL class is declared.
   *
   * Strategy: search `sourcesContent` (when present) for the CSS selector
   * pattern `.{className}` followed by `{` or `,`. Returns the line/column of
   * the `.` in the original source file.
   *
   * Returns `undefined` when sourcesContent is absent or the class is not found
   * — in that case the adapter falls back to MEDIUM confidence.
   */
  findClassDeclaration(className: string): ResolvedRange | undefined {
    if (this.sourcesContent === undefined) return undefined;
    for (let i = 0; i < this.sourcesContent.length; i++) {
      const content = this.sourcesContent[i];
      if (content === undefined) continue;
      const sourceFile = this.sources[i];
      if (sourceFile === undefined) continue;
      const range = findClassInContent(content, className);
      if (range !== undefined) {
        return { sourceFile, ...range };
      }
    }
    return undefined;
  }

  /** All decoded segments (for debugging / testing). */
  get allSegments(): readonly (readonly SourceMapSegment[])[] {
    return this.segments;
  }
}

const escapeRegex = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findClassInContent = (
  content: string,
  className: string,
): { startLine: number; startColumn: number; endLine: number; endColumn: number } | undefined => {
  const pattern = new RegExp(`\\.${escapeRegex(className)}(?=\\s*[{,])`);
  const match = content.match(pattern);
  if (match === null || match.index === undefined) return undefined;
  const charIndex = match.index;
  const before = content.slice(0, charIndex);
  const lines = before.split("\n");
  const startLine = lines.length - 1;
  const lastLine = lines[lines.length - 1] ?? "";
  const startColumn = lastLine.length;
  return {
    startLine,
    startColumn,
    endLine: startLine,
    endColumn: startColumn + className.length + 1,
  };
};

/**
 * Parse a raw source-map v3 JSON value into a {@link CssSourceMap}.
 * Returns `undefined` for non-v3 or malformed input.
 */
export const parseSourceMap = (input: unknown): CssSourceMap | undefined => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const obj = input as Record<string, unknown>;
  if (obj.version !== 3) return undefined;
  if (typeof obj.mappings !== "string") return undefined;

  const sources = Array.isArray(obj.sources)
    ? obj.sources.filter((s): s is string => typeof s === "string")
    : [];
  const sourcesContent = Array.isArray(obj.sourcesContent)
    ? obj.sourcesContent.map((s) => (typeof s === "string" ? s : undefined))
    : undefined;

  const segments = decodeMappings(obj.mappings);
  return new CssSourceMap(sources, segments, sourcesContent);
};

/** Decode VLQ-encoded source-map mappings string into structured segments. */
const decodeMappings = (mappings: string): SourceMapSegment[][] => {
  const lines = mappings.split(";");
  const result: SourceMapSegment[][] = [];

  let prevSourceIndex = 0;
  let prevSourceLine = 0;
  let prevSourceColumn = 0;
  let prevNameIndex = 0;

  for (let line = 0; line < lines.length; line++) {
    const lineStr = lines[line];
    if (lineStr === undefined || lineStr === "") {
      result.push([]);
      continue;
    }

    const segmentStrs = lineStr.split(",");
    const lineSegments: SourceMapSegment[] = [];
    let prevGeneratedColumn = 0;

    for (const segStr of segmentStrs) {
      if (segStr === "") continue;
      const decoded = decodeVlqSegment(segStr);
      if (decoded.length === 0) continue;

      prevGeneratedColumn += decoded[0] ?? 0;

      if (decoded.length >= 4) {
        prevSourceIndex += decoded[1] ?? 0;
        prevSourceLine += decoded[2] ?? 0;
        prevSourceColumn += decoded[3] ?? 0;
        if (decoded.length >= 5) {
          prevNameIndex += decoded[4] ?? 0;
          lineSegments.push({
            generatedLine: line,
            generatedColumn: prevGeneratedColumn,
            sourceIndex: prevSourceIndex,
            sourceLine: prevSourceLine,
            sourceColumn: prevSourceColumn,
            nameIndex: prevNameIndex,
          });
        } else {
          lineSegments.push({
            generatedLine: line,
            generatedColumn: prevGeneratedColumn,
            sourceIndex: prevSourceIndex,
            sourceLine: prevSourceLine,
            sourceColumn: prevSourceColumn,
          });
        }
      } else {
        lineSegments.push({
          generatedLine: line,
          generatedColumn: prevGeneratedColumn,
        });
      }
    }

    result.push(lineSegments);
  }

  return result;
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
