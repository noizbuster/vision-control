/**
 * Component prop discovery (VC-V1V2-21 / PRD 7.2 component-props).
 *
 * Given a component tag in source text, this module discovers the props
 * (attributes) set on it and classifies each as a safe static literal or a
 * dynamic expression. Only static literals are candidates for deterministic
 * editing; dynamic expressions are flagged for agent-required reasoning.
 *
 * The scanner is lightweight (no full JS parser dependency): it locates the
 * component tag by name, walks its attributes character-by-character respecting
 * quotes and brace nesting, and classifies each value using pattern heuristics.
 * Anything ambiguous is conservatively classified as dynamic — the
 * misleading-success-output guard.
 *
 * Frameworks supported: JSX/TSX (`<Button variant="secondary">`), Vue
 * (`<Button variant="secondary" :disabled="false">`), Svelte
 * (`<Button variant="secondary" disabled={false}>`).
 */

import type { SourceRange } from "../suggested-diff/diff-format.js";

/** The framework that authored the component tag. */
export type ComponentFramework = "jsx" | "vue" | "svelte";

/**
 * The value nature of a discovered prop.
 *
 * `literal-*` kinds are safe static values eligible for deterministic editing.
 * The remaining kinds are dynamic/computed and must be deferred to an agent.
 */
export type PropValueKind =
  | "literal-string"
  | "literal-boolean"
  | "literal-number"
  | "dynamic-expression"
  | "member-access"
  | "computed"
  | "identifier";

/**
 * One discovered prop on a component instance.
 *
 * Literal props carry `literalValue` and `sourceRange` — the prerequisites for
 * a deterministic suggestion. Dynamic props omit both; the caller produces an
 * agent-required signal.
 */
export interface DiscoveredProp {
  readonly name: string;
  readonly kind: PropValueKind;
  /** Raw value text as it appears in source (quoted string body, expression body, or "" for shorthand). */
  readonly rawValue: string;
  /** Resolved literal value. Present only for `literal-*` kinds. */
  readonly literalValue?: string | number | boolean;
  /** Precise source range of the value. Present only for `literal-*` kinds. */
  readonly sourceRange?: SourceRange;
  /** True when the value is a Vue/Svelte directive binding (`:prop`, `v-bind:`, `bind:`). */
  readonly isBinding?: boolean;
}

/** Input for {@link discoverProps}. */
export interface PropDiscoveryInput {
  readonly framework: ComponentFramework;
  readonly componentName: string;
  readonly filePath: string;
  readonly sourceText: string;
  /**
   * Optional line offset (1-based) to disambiguate when the same component
   * appears multiple times. The scanner finds the instance whose opening tag
   * starts at or after this line.
   */
  readonly nearLine?: number;
  /**
   * Supplementary runtime prop values from live DOM inspection. Merged into
   * each discovered prop as `runtimeValue` when the name matches. Runtime data
   * supplements but never overrides the AST classification.
   */
  readonly runtimeProps?: Readonly<Record<string, string>>;
}

/** Result of prop discovery. */
export interface PropDiscoveryResult {
  readonly componentName: string;
  readonly framework: ComponentFramework;
  readonly filePath: string;
  readonly props: readonly DiscoveredProp[];
}

/**
 * Discover the props on a component instance in source text.
 *
 * Returns a result with the discovered props. When the component tag is not
 * found, returns an empty props array (the caller decides how to surface that).
 */
export const discoverProps = (input: PropDiscoveryInput): PropDiscoveryResult => {
  const tagStart = findComponentTag(input.sourceText, input.componentName, input.nearLine);
  if (tagStart === undefined) {
    return {
      componentName: input.componentName,
      framework: input.framework,
      filePath: input.filePath,
      props: [],
    };
  }
  const attrs = parseAttributes(input.sourceText, tagStart, input.framework);
  const lineOffsets = computeLineOffsets(input.sourceText);
  const props: DiscoveredProp[] = attrs.map((attr) =>
    classifyAttribute(attr, lineOffsets, input.framework),
  );
  return {
    componentName: input.componentName,
    framework: input.framework,
    filePath: input.filePath,
    props,
  };
};

/** True when the prop is a safe static literal eligible for deterministic editing. */
export const isLiteralProp = (prop: DiscoveredProp): boolean =>
  prop.kind === "literal-string" ||
  prop.kind === "literal-boolean" ||
  prop.kind === "literal-number";

// ---------------------------------------------------------------------------
// Tag finding
// ---------------------------------------------------------------------------

const findComponentTag = (
  sourceText: string,
  componentName: string,
  nearLine?: number,
): number | undefined => {
  const pattern = new RegExp(`<${escapeRegex(componentName)}\\b`, "g");
  const matches: number[] = [];
  let m: RegExpExecArray | null = pattern.exec(sourceText);
  while (m !== null) {
    matches.push(m.index);
    m = pattern.exec(sourceText);
  }
  if (matches.length === 0) return undefined;
  if (nearLine === undefined) return matches[0];
  const nearOffset = offsetForLine(computeLineOffsets(sourceText), nearLine);
  const after = matches.find((idx) => idx >= nearOffset);
  return after ?? matches[matches.length - 1];
};

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------------------
// Line offset table
// ---------------------------------------------------------------------------

const computeLineOffsets = (text: string): number[] => {
  const offsets = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
};

const offsetForLine = (offsets: readonly number[], line: number): number => {
  const idx = Math.min(line - 1, offsets.length - 1);
  return offsets[idx] ?? 0;
};

const offsetToRange = (
  offsets: readonly number[],
  startOffset: number,
  endOffset: number,
): SourceRange => {
  const findLineCol = (pos: number): { line: number; column: number } => {
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const midOffset = offsets[mid];
      if (midOffset === undefined) {
        hi = mid - 1;
        continue;
      }
      if (midOffset <= pos) lo = mid;
      else hi = mid - 1;
    }
    const base = offsets[lo] ?? 0;
    return { line: lo + 1, column: pos - base };
  };
  const start = findLineCol(startOffset);
  const end = findLineCol(endOffset);
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
};

// ---------------------------------------------------------------------------
// Attribute parsing
// ---------------------------------------------------------------------------

interface ParsedAttribute {
  readonly name: string;
  readonly isBinding: boolean;
  readonly valueStart: number;
  readonly valueEnd: number;
  readonly rawValue: string;
  readonly isShorthand: boolean;
  readonly valueForm: "quoted" | "braced" | "shorthand" | "unquoted";
}

const parseAttributes = (
  sourceText: string,
  tagStart: number,
  framework: ComponentFramework,
): ParsedAttribute[] => {
  const attrs: ParsedAttribute[] = [];
  let i = tagStart;
  // Skip past the tag name
  while (i < sourceText.length && !isWhitespace(sourceText[i])) {
    i += 1;
  }
  while (i < sourceText.length) {
    const ch = sourceText[i];
    if (ch === undefined) break;
    if (isWhitespace(ch)) {
      i += 1;
      continue;
    }
    if (ch === ">" || (ch === "/" && sourceText[i + 1] === ">")) break;

    const nameStart = i;
    while (
      i < sourceText.length &&
      !isWhitespace(sourceText[i]) &&
      sourceText[i] !== "=" &&
      sourceText[i] !== ">" &&
      sourceText[i] !== "/"
    ) {
      i += 1;
    }
    const name = sourceText.slice(nameStart, i);
    if (name.length === 0) {
      i += 1;
      continue;
    }

    const { cleanName, isBinding } = normalizeName(name, framework);

    // Skip whitespace
    while (i < sourceText.length && isWhitespace(sourceText[i])) {
      i += 1;
    }

    if (sourceText[i] !== "=") {
      const pos = nameStart;
      attrs.push({
        name: cleanName,
        isBinding,
        valueStart: pos,
        valueEnd: pos,
        rawValue: "",
        isShorthand: true,
        valueForm: "shorthand",
      });
      continue;
    }

    i += 1; // skip =
    while (i < sourceText.length && isWhitespace(sourceText[i])) {
      i += 1;
    }

    const ch2 = sourceText[i];
    if (ch2 === '"' || ch2 === "'") {
      const quote = ch2;
      const valStart = i + 1;
      i += 1;
      while (i < sourceText.length && sourceText[i] !== quote) {
        i += 1;
      }
      const valEnd = i;
      i += 1; // skip closing quote
      attrs.push({
        name: cleanName,
        isBinding,
        valueStart: valStart,
        valueEnd: valEnd,
        rawValue: sourceText.slice(valStart, valEnd),
        isShorthand: false,
        valueForm: "quoted",
      });
    } else if (ch2 === "{") {
      const valStart = i + 1;
      const { end, content } = readBracedExpression(sourceText, i);
      i = end;
      attrs.push({
        name: cleanName,
        isBinding,
        valueStart: valStart,
        valueEnd: valStart + content.length,
        rawValue: content,
        isShorthand: false,
        valueForm: "braced",
      });
    } else {
      // Unquoted bare value (rare in JSX but valid in HTML)
      const valStart = i;
      while (
        i < sourceText.length &&
        !isWhitespace(sourceText[i]) &&
        sourceText[i] !== ">" &&
        sourceText[i] !== "/"
      ) {
        i += 1;
      }
      attrs.push({
        name: cleanName,
        isBinding,
        valueStart: valStart,
        valueEnd: i,
        rawValue: sourceText.slice(valStart, i),
        isShorthand: false,
        valueForm: "unquoted",
      });
    }
  }
  return attrs;
};

const readBracedExpression = (
  sourceText: string,
  braceStart: number,
): { end: number; content: string } => {
  let depth = 0;
  let i = braceStart;
  let quote: string | null = null;
  while (i < sourceText.length) {
    const ch = sourceText[i];
    if (quote !== null) {
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const content = sourceText.slice(braceStart + 1, i);
        return { end: i + 1, content: content.trim() };
      }
    }
    i += 1;
  }
  return { end: i, content: sourceText.slice(braceStart + 1, i).trim() };
};

const normalizeName = (
  name: string,
  framework: ComponentFramework,
): { cleanName: string; isBinding: boolean } => {
  if (framework === "vue") {
    if (name.startsWith("v-bind:")) return { cleanName: name.slice(7), isBinding: true };
    if (name.startsWith(":")) return { cleanName: name.slice(1), isBinding: true };
  }
  return { cleanName: name, isBinding: false };
};

// ---------------------------------------------------------------------------
// Value classification
// ---------------------------------------------------------------------------

const classifyAttribute = (
  attr: ParsedAttribute,
  lineOffsets: number[],
  _framework: ComponentFramework,
): DiscoveredProp => {
  if (attr.isShorthand) {
    return {
      name: attr.name,
      kind: "literal-boolean",
      rawValue: "",
      literalValue: true,
      ...(attr.valueStart !== attr.valueEnd
        ? { sourceRange: offsetToRange(lineOffsets, attr.valueStart, attr.valueEnd) }
        : {}),
    };
  }

  const value = attr.rawValue.trim();

  // A braced expression (JSX/Svelte `={expr}`) is always an expression context.
  if (attr.valueForm === "braced") {
    return classifyExpression(attr.name, value, attr, lineOffsets);
  }

  // A Vue binding (`:prop="expr"` or `v-bind:prop="expr"`) is an expression
  // context — the quoted value is a JS expression, not a string literal.
  if (attr.isBinding) {
    return classifyExpression(attr.name, value, attr, lineOffsets);
  }

  // A quoted string attribute (`variant="secondary"`) is a literal string —
  // the value IS the string content. This applies to JSX, Vue static props,
  // and Svelte.
  return {
    name: attr.name,
    kind: "literal-string",
    rawValue: value,
    literalValue: value,
    sourceRange: offsetToRange(lineOffsets, attr.valueStart, attr.valueEnd),
  };
};

const classifyExpression = (
  name: string,
  expr: string,
  attr: ParsedAttribute,
  lineOffsets: number[],
): DiscoveredProp => {
  const trimmed = expr.trim();

  if (trimmed === "true" || trimmed === "false") {
    return literalProp(name, attr, "literal-boolean", trimmed === "true", lineOffsets);
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number.parseFloat(trimmed);
    return literalProp(name, attr, "literal-number", num, lineOffsets);
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return literalProp(name, attr, "literal-string", trimmed.slice(1, -1), lineOffsets);
  }

  if (trimmed.includes("?") && trimmed.includes(":")) {
    return dynamicProp(name, attr, "computed", trimmed, lineOffsets);
  }

  if (trimmed.includes("(")) {
    return dynamicProp(name, attr, "dynamic-expression", trimmed, lineOffsets);
  }

  if (trimmed.includes(".")) {
    return dynamicProp(name, attr, "member-access", trimmed, lineOffsets);
  }

  return dynamicProp(name, attr, "identifier", trimmed, lineOffsets);
};

const literalProp = (
  name: string,
  attr: ParsedAttribute,
  kind: "literal-string" | "literal-boolean" | "literal-number",
  literalValue: string | number | boolean,
  lineOffsets: number[],
): DiscoveredProp => ({
  name,
  kind,
  rawValue: attr.rawValue,
  literalValue,
  sourceRange: offsetToRange(lineOffsets, attr.valueStart, attr.valueEnd),
  ...(attr.isBinding ? { isBinding: true } : {}),
});

const dynamicProp = (
  name: string,
  attr: ParsedAttribute,
  kind: "dynamic-expression" | "member-access" | "computed" | "identifier",
  rawValue: string,
  _lineOffsets: number[],
): DiscoveredProp => ({
  name,
  kind,
  rawValue,
  ...(attr.isBinding ? { isBinding: true } : {}),
});

const isWhitespace = (ch: string | undefined): boolean =>
  ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
