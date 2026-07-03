/**
 * Lightweight Vue SFC template element scanner (VC-V1V2-19).
 *
 * Scans the `<template>` block of a `.vue` Single-File Component for HTML-like
 * element opening tags and records the data the source-id generator and
 * registry need: the insertion offset (right after the element name), the
 * source range, the inferred tag name, and any STATIC class.
 *
 * This is intentionally NOT a full HTML/Vue-template parser. It is a
 * deliberately narrow scanner that handles basic host elements and custom
 * component tags. It deliberately does NOT depend on @vue/compiler-dom or
 * @vue/compiler-sfc (private compiler internals are out of scope for the spike
 * and would add a heavy dependency). Unsupported constructs are reported as
 * diagnostics by {@link detectVueUnsupported} so callers never get a silent
 * wrong result.
 *
 * Discrimination is character-based (no regex on tag names) to handle the full
 * range of valid Vue tag names including kebab-case, PascalCase, and namespaced
 * tags.
 */

export interface TemplateElement {
  /** Char offset right after the element NAME — the attribute insertion point. */
  readonly nameEnd: number;
  /** Char offset of the opening tag's `<`. */
  readonly tagStart: number;
  /** Char offset after the opening tag's closing `>` or `/>`. */
  readonly tagEnd: number;
  /** The tag name (e.g. "div", "MyButton", "router-link"). */
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
  /** The raw source slice of the opening tag (`<div ...>` or `<div/>`). */
  readonly source: string;
}

const isTagNameChar = (ch: string): boolean => /[A-Za-z0-9\-:_.]/.test(ch);

const isNameStartChar = (ch: string): boolean => /[A-Za-z]/.test(ch);

/**
 * Build a line-start offset table so we can convert char offsets to line/column.
 */
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

/**
 * Extract a static `class="..."` or `class='...'` value from the attribute
 * portion of an opening tag. Returns undefined for dynamic bindings
 * (`:class`, `v-bind:class`) or absent class.
 */
const extractStaticClass = (attrSource: string): string | undefined => {
  const match = /\sclass\s*=\s*"([^"]*)"/.exec(attrSource);
  if (match !== null && match[1] !== undefined) return match[1].trim();
  const singleMatch = /\sclass\s*=\s*'([^']*)'/.exec(attrSource);
  if (singleMatch !== null && singleMatch[1] !== undefined) return singleMatch[1].trim();
  return undefined;
};

const hasDataVcSource = (attrSource: string): boolean => /data-vc-source/.test(attrSource);

/**
 * Scan a block of Vue template source (NOT the full SFC — just the template
 * content) for element opening tags. `blockOffset` is the char offset of the
 * template content's start within the full file, so line/column are file-relative.
 *
 * Tags are identified by `<` followed by a letter. Closing tags (`</`), comments
 * (`<!--`), and doctype declarations (`<!`) are skipped. Self-closing tags
 * (`<br/>`) and void elements are handled. The tag's attribute region extends
 * from `nameEnd` to the first unquoted `>` or `/>`.
 */
export const scanTemplateElements = (
  templateContent: string,
  blockOffset: number,
): TemplateElement[] => {
  const elements: TemplateElement[] = [];
  const fullCode = templateContent;
  const lineOffsets = buildLineTable(templateContent);

  let i = 0;
  while (i < fullCode.length) {
    const ch = fullCode[i];
    if (ch !== "<") {
      i += 1;
      continue;
    }
    const next = fullCode[i + 1];
    if (next === undefined) break;
    if (next === "/" || next === "!" || next === "?") {
      i += 1;
      continue;
    }
    if (!isNameStartChar(next)) {
      i += 1;
      continue;
    }

    // Capture tag name.
    let nameEnd = i + 1;
    while (nameEnd < fullCode.length && isTagNameChar(fullCode[nameEnd] ?? "")) {
      nameEnd += 1;
    }
    const tagName = fullCode.slice(i + 1, nameEnd);
    if (tagName.length === 0) {
      i += 1;
      continue;
    }

    // Find the end of the opening tag (first unquoted > or />).
    const attrStart = nameEnd;
    let searchEnd = nameEnd;
    let inQuote: string | undefined;
    while (searchEnd < fullCode.length) {
      const sc = fullCode[searchEnd];
      if (inQuote !== undefined) {
        if (sc === inQuote) inQuote = undefined;
      } else if (sc === '"' || sc === "'") {
        inQuote = sc;
      } else if (sc === ">") {
        break;
      }
      searchEnd += 1;
    }
    if (searchEnd >= fullCode.length) {
      i = searchEnd;
      continue;
    }

    const isSelfClosing = fullCode[searchEnd - 1] === "/";
    const tagEnd = searchEnd + 1;
    const attrSource = fullCode.slice(attrStart, searchEnd);

    const startFileOffset = blockOffset + i;
    const tagEndFileOffset = blockOffset + tagEnd;
    const startLC = offsetToLineCol(lineOffsets, i);
    const endLC = offsetToLineCol(lineOffsets, tagEnd - 1);

    elements.push({
      nameEnd: blockOffset + nameEnd,
      tagStart: startFileOffset,
      tagEnd: tagEndFileOffset,
      tagName,
      startLine: startLC.line,
      startColumn: startLC.column,
      endLine: endLC.line,
      endColumn: endLC.column + 1,
      staticClassName: extractStaticClass(attrSource),
      alreadyMarked: hasDataVcSource(attrSource),
      source: fullCode.slice(i, tagEnd),
    });

    i = tagEnd;
    if (isSelfClosing) {
      // already advanced past the />
    }
  }

  return elements;
};
