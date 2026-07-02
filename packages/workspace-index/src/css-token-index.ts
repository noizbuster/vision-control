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

/**
 * Parse plain CSS content and extract every class-selector definition.
 *
 * Strategy: scan line-by-line; when a line opens a `{` block, treat the text
 * before the brace as a selector and extract class names from it. Text inside
 * declaration blocks (`{ ... }`) is never scanned, so class-like strings in
 * property values (`content: ".fake"`) are not false-positive matches.
 *
 * Known limitation: multi-line selectors where the selector text spans several
 * lines before the `{` are only partially captured (the line containing `{`).
 * This covers well-formatted single-line selectors which are the overwhelming
 * majority of plain CSS.
 */
export const parseCssClasses = (
  content: string,
  workspaceRelativePath: string,
): CssTokenEntry[] => {
  const entries: CssTokenEntry[] = [];
  const lines = content.split("\n");
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const line = lines[lineIdx];
    if (lineIdx >= lines.length) break;
    if (line === undefined) continue;
    const openBrace = line.indexOf("{");
    if (openBrace === -1) continue;
    const selectorText = line.slice(0, openBrace).trim();
    if (selectorText.length === 0) continue;
    CLASS_NAME_RE.lastIndex = 0;
    let match: RegExpExecArray | null = CLASS_NAME_RE.exec(selectorText);
    while (match !== null) {
      const className = match[1];
      if (className !== undefined) {
        entries.push(
          CssTokenEntrySchema.parse({
            className,
            workspaceRelativePath,
            line: lineIdx + 1,
            column: match.index,
            selector: selectorText,
          }),
        );
      }
      match = CLASS_NAME_RE.exec(selectorText);
    }
  }
  return entries;
};
