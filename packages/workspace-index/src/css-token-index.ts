import { z } from "zod";

/**
 * Static CSS class-token origin index (PRD 14.5 priority 3 / 15.3).
 *
 * Parses plain CSS (`.css`) files for class selectors and records where each
 * class name is defined: file, line, column, and the full selector text. When a
 * user edits a CSS class on an element, the source resolver can point to the
 * exact source location of that class definition.
 *
 * Scope boundary: this index ONLY covers plain CSS static class selectors.
 * Tailwind utility classes (`bg-red-500`, `flex`, ...) are NOT resolved to a
 * Tailwind token origin — that is a V1 feature. CSS Modules mapping is also a
 * V1 feature. See `v1-stubs` in the source-resolver package.
 */

/** One CSS class-token definition extracted from a `.css` file. */
export const CssTokenEntrySchema = z.object({
  className: z.string().min(1),
  workspaceRelativePath: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().nonnegative(),
  selector: z.string().min(1),
});

export type CssTokenEntry = z.infer<typeof CssTokenEntrySchema>;

/**
 * In-memory index of CSS class-token definitions. Supports lookup by class
 * name; returns ALL definitions (a class may be defined in multiple files or
 * multiple selectors in one file).
 */
export class CssTokenIndex {
  private readonly byClassName = new Map<string, CssTokenEntry[]>();

  addEntry(entry: CssTokenEntry): void {
    const parsed = CssTokenEntrySchema.parse(entry);
    let bucket = this.byClassName.get(parsed.className);
    if (bucket === undefined) {
      bucket = [];
      this.byClassName.set(parsed.className, bucket);
    }
    bucket.push(parsed);
  }

  lookup(className: string): readonly CssTokenEntry[] {
    return this.byClassName.get(className) ?? [];
  }

  getAllClassNames(): readonly string[] {
    return [...this.byClassName.keys()];
  }

  get entryCount(): number {
    let total = 0;
    for (const entries of this.byClassName.values()) total += entries.length;
    return total;
  }

  get classCount(): number {
    return this.byClassName.size;
  }

  clear(): void {
    this.byClassName.clear();
  }
}

const CLASS_NAME_RE = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;

const computeLineStarts = (content: string): readonly number[] => {
  const starts: number[] = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10 /* \n */) starts.push(i + 1);
  }
  return starts;
};

const offsetToLineCol = (
  offset: number,
  lineStarts: readonly number[],
): { readonly line: number; readonly column: number } => {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - (lineStarts[lo] ?? 0) };
};

/**
 * Parse plain CSS content and extract every class-selector definition.
 *
 * A single-pass scan over the whole file: text accumulates into a selector
 * buffer until a `{` is hit, at which point class names are extracted from the
 * accumulated text (handling comma lists and selectors spanning multiple
 * lines); a `}` discards any text accumulated inside a declaration block. The
 * buffer is reset at every brace, so selectors nested inside `@media` (or CSS
 * nesting) are captured at their real position. Text inside a declaration
 * value (`content: ".fake"`) accumulates only between a `{` and the next `}`
 * and is never flushed by a `{`, so class-like property values are not matched.
 *
 * Robust to malformed input: an unclosed trailing selector is simply not
 * flushed (no entry), a stray `}` only clears the buffer, and an empty input
 * yields an empty result.
 */
export const parseCssClasses = (
  content: string,
  workspaceRelativePath: string,
): CssTokenEntry[] => {
  const entries: CssTokenEntry[] = [];
  const lineStarts = computeLineStarts(content);

  const flushSelector = (selector: string, selectorOffset: number): void => {
    const trimmed = selector.trim();
    if (trimmed.length === 0) return;
    const baseOffset = selectorOffset + (selector.length - selector.trimStart().length);
    CLASS_NAME_RE.lastIndex = 0;
    let match: RegExpExecArray | null = CLASS_NAME_RE.exec(trimmed);
    while (match !== null) {
      const className = match[1];
      if (className !== undefined) {
        const { line, column } = offsetToLineCol(baseOffset + match.index, lineStarts);
        entries.push(
          CssTokenEntrySchema.parse({
            className,
            workspaceRelativePath,
            line,
            column,
            selector: trimmed,
          }),
        );
      }
      match = CLASS_NAME_RE.exec(trimmed);
    }
  };

  let buffer = "";
  let bufferOffset = 0;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === "{") {
      flushSelector(buffer, bufferOffset);
      buffer = "";
      bufferOffset = i + 1;
    } else if (ch === "}") {
      buffer = "";
      bufferOffset = i + 1;
    } else {
      if (buffer.length === 0) bufferOffset = i;
      buffer += ch;
    }
  }
  return entries;
};
