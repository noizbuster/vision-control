/**
 * Lightweight Svelte markup element scanner (VC-V1V2-19).
 *
 * Scans the markup portion of a `.svelte` component for HTML-like element
 * opening tags and records the data the source-id generator and registry need.
 *
 * This is intentionally NOT a full Svelte parser. It is a deliberately narrow
 * scanner that handles basic host elements and custom component tags. It
 * deliberately does NOT depend on `svelte/compiler` or `svelte-preprocess`
 * (private compiler internals are out of scope for the spike and would add a
 * heavy dependency). Unsupported constructs are reported as diagnostics by
 * {@link detectSvelteUnsupported} so callers never get a silent wrong result.
 *
 * Svelte components have no `<template>` wrapper — the whole file is the markup
 * (minus `<script>` and `<style>` blocks, which the marker plugin excludes
 * before scanning).
 */

export interface MarkupElement {
  /** Char offset right after the element NAME — the attribute insertion point. */
  readonly nameEnd: number;
  /** Char offset of the opening tag's `<`. */
  readonly tagStart: number;
  /** Char offset after the opening tag's closing `>` or `/>`. */
  readonly tagEnd: number;
  /** The tag name (e.g. "div", "MyButton", "svelte:self"). */
  readonly tagName: string;
  /** 1-based line of the `<`. */
  readonly startLine: number;
  /** 0-based column of the `<`. */
  readonly startColumn: number;
  /** 1-based line of the closing `>` / `/>`. */
  readonly endLine: number;
  /** 0-based column after the closing `>` / `/>`. */
  readonly endColumn: number;
  /** Static class="..." value, or undefined when dynamic/absent. */
  readonly staticClassName: string | undefined;
  /** True when the element already carries data-vc-source. */
  readonly alreadyMarked: boolean;
  /** The raw source slice of the opening tag. */
  readonly source: string;
}

const isTagNameChar = (ch: string): boolean => /[A-Za-z0-9\-:_.]/.test(ch);
const isNameStartChar = (ch: string): boolean => /[A-Za-z]/.test(ch);

const buildLineTable = (code: string): number[] => {
  const offsets = [0];
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
};

const offsetToLineCol = (
  offsets: readonly number[],
  charOffset: number,
): { line: number; column: number } => {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const midOffset = offsets[mid];
    if (midOffset === undefined) break;
    if (midOffset <= charOffset) lo = mid;
    else hi = mid - 1;
  }
  const base = offsets[lo] ?? 0;
  return { line: lo + 1, column: charOffset - base };
};

const extractStaticClass = (attrSource: string): string | undefined => {
  const match = /\sclass\s*=\s*"([^"]*)"/.exec(attrSource);
  if (match !== null && match[1] !== undefined) return match[1].trim();
  const singleMatch = /\sclass\s*=\s*'([^']*)'/.exec(attrSource);
  if (singleMatch !== null && singleMatch[1] !== undefined) return singleMatch[1].trim();
  return undefined;
};

const hasDataVcSource = (attrSource: string): boolean => /data-vc-source/.test(attrSource);

/**
 * Scan a block of Svelte markup source for element opening tags. `blockOffset`
 * is the char offset of the markup content's start within the full file, so
 * line/column are file-relative.
 *
 * Tags are identified by `<` followed by a letter. Closing tags (`</`), comments
 * (`<!--`), Svelte control blocks (`{#if}`, `{#each}`), and doctype declarations
 * (`<!`) are skipped. The tag's attribute region extends from `nameEnd` to the
 * first unquoted `>` or `/>`.
 */
export const scanMarkupElements = (markupContent: string, blockOffset: number): MarkupElement[] => {
  const elements: MarkupElement[] = [];
  const lineOffsets = buildLineTable(markupContent);

  let i = 0;
  while (i < markupContent.length) {
    const ch = markupContent[i];
    if (ch !== "<") {
      i += 1;
      continue;
    }
    const next = markupContent[i + 1];
    if (next === undefined) break;
    if (next === "/" || next === "!" || next === "?") {
      i += 1;
      continue;
    }
    if (!isNameStartChar(next)) {
      i += 1;
      continue;
    }

    let nameEnd = i + 1;
    while (nameEnd < markupContent.length && isTagNameChar(markupContent[nameEnd] ?? "")) {
      nameEnd += 1;
    }
    const tagName = markupContent.slice(i + 1, nameEnd);
    if (tagName.length === 0) {
      i += 1;
      continue;
    }

    let searchEnd = nameEnd;
    let inQuote: string | undefined;
    while (searchEnd < markupContent.length) {
      const sc = markupContent[searchEnd];
      if (inQuote !== undefined) {
        if (sc === inQuote) inQuote = undefined;
      } else if (sc === '"' || sc === "'") {
        inQuote = sc;
      } else if (sc === ">") {
        break;
      }
      searchEnd += 1;
    }
    if (searchEnd >= markupContent.length) {
      i = searchEnd;
      continue;
    }

    const tagEnd = searchEnd + 1;
    const attrSource = markupContent.slice(nameEnd, searchEnd);

    const startLC = offsetToLineCol(lineOffsets, i);
    const endLC = offsetToLineCol(lineOffsets, tagEnd - 1);

    elements.push({
      nameEnd: blockOffset + nameEnd,
      tagStart: blockOffset + i,
      tagEnd: blockOffset + tagEnd,
      tagName,
      startLine: startLC.line,
      startColumn: startLC.column,
      endLine: endLC.line,
      endColumn: endLC.column + 1,
      staticClassName: extractStaticClass(attrSource),
      alreadyMarked: hasDataVcSource(attrSource),
      source: markupContent.slice(i, tagEnd),
    });

    i = tagEnd;
  }

  return elements;
};
