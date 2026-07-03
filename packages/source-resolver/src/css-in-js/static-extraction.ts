/**
 * Static style extraction from CSS-in-JS definitions (VC-V1V2-20 / PRD 15.4-15.5).
 *
 * styled-components, emotion, and stitches define styles at module-evaluation
 * time. When the style body is a LITERAL (object literal with string/number
 * values, or a template literal with no interpolation) the declarations are
 * DETERMINISTIC: they can be extracted to a concrete source range and owned by
 * the AST. When the body contains interpolation, computed keys, member access,
 * spreads, or function calls, the values are RUNTIME-GENERATED and must be
 * deferred to an agent (no deterministic patch).
 *
 * This module classifies a caller-located {@link CssInJsDefinition} and extracts
 * the static declarations. It does NOT run a full JS parser — it uses a
 * depth-aware tokenizer that is sufficient for the deterministic cases and
 * conservatively flags anything ambiguous as dynamic (the agent-required path).
 *
 * The classification drives confidence in {@link ./adapter.ts}:
 * - fully static + source range -> HIGH with `ast-origin` evidence (solo-strong).
 * - any dynamic marker -> MEDIUM/LOW with `text-search` + "agent-required".
 */

/** The CSS-in-JS library flavor (affects nothing structurally; advisory). */
export type CssInJsFlavor = "styled-components" | "emotion" | "stitches" | "unknown";

/** The syntactic shape of the style definition body. */
export type StyleDefinitionShape = "object-literal" | "template-literal" | "unknown";

/** A single extracted CSS declaration (property + literal value). */
export interface ExtractedDeclaration {
  readonly property: string;
  readonly value: string;
}

/** Why a definition was classified dynamic. */
export type DynamicReason =
  | "template-interpolation"
  | "computed-property"
  | "function-value"
  | "spread-element"
  | "props-reference"
  | "unknown-shape";

/** Result of static extraction. */
export interface StaticStyleExtraction {
  /** `true` ONLY when every declaration is a static literal (deterministic). */
  readonly isStatic: boolean;
  readonly flavor: CssInJsFlavor;
  readonly shape: StyleDefinitionShape;
  readonly declarations: readonly ExtractedDeclaration[];
  /** Present only when `isStatic` is `false`. */
  readonly dynamicReason?: DynamicReason;
}

/**
 * A CSS-in-JS style definition at a caller-located source range. The caller
 * (workspace index / AST walker) is responsible for the source range; this
 * module only classifies the `body` text.
 */
export interface CssInJsDefinition {
  readonly flavor: CssInJsFlavor;
  readonly shape: StyleDefinitionShape;
  /**
   * The raw style body. For an object literal, the text INSIDE the braces
   * (e.g. `color: "red", padding: 12`). For a template literal, the CSS text
   * (e.g. `color: red;\n  padding: 8px;`).
   */
  readonly body: string;
  readonly workspaceRelativePath: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly componentName?: string;
}

const TEMPLATE_INTERPOLATION = /\$\{/;

/**
 * Extract and classify a CSS-in-JS style definition.
 *
 * Deterministic when `isStatic === true`: every declaration is a literal and
 * the definition can be owned by the AST at the given source range. Otherwise
 * `dynamicReason` explains why the definition is runtime-generated and must be
 * deferred to an agent.
 */
export const extractStaticStyles = (definition: CssInJsDefinition): StaticStyleExtraction => {
  const { shape, body, flavor } = definition;

  if (shape === "object-literal") {
    return extractObjectLiteral(body, flavor);
  }
  if (shape === "template-literal") {
    return extractTemplateLiteral(body, flavor);
  }
  return {
    isStatic: false,
    flavor,
    shape,
    declarations: [],
    dynamicReason: "unknown-shape",
  };
};

const extractObjectLiteral = (body: string, flavor: CssInJsFlavor): StaticStyleExtraction => {
  const segments = splitTopLevel(body, ",");
  const declarations: ExtractedDeclaration[] = [];
  let dynamicReason: DynamicReason | undefined;

  for (const raw of segments) {
    const segment = raw.trim();
    if (segment === "") continue;

    if (segment.startsWith("...")) {
      dynamicReason = "spread-element";
      break;
    }

    const colonIdx = findTopLevelColon(segment);
    if (colonIdx === -1) {
      dynamicReason = "unknown-shape";
      break;
    }
    const keyRaw = segment.slice(0, colonIdx).trim();
    const valueRaw = segment.slice(colonIdx + 1).trim();

    const key = stripQuotes(keyRaw);
    if (key.startsWith("[") && key.endsWith("]")) {
      dynamicReason = "computed-property";
      break;
    }

    const classified = classifyValue(valueRaw);
    if (!classified.isStatic) {
      dynamicReason = classified.reason;
      break;
    }
    declarations.push({ property: key, value: classified.value });
  }

  if (dynamicReason !== undefined) {
    return { isStatic: false, flavor, shape: "object-literal", declarations, dynamicReason };
  }
  return { isStatic: true, flavor, shape: "object-literal", declarations };
};

const extractTemplateLiteral = (body: string, flavor: CssInJsFlavor): StaticStyleExtraction => {
  if (TEMPLATE_INTERPOLATION.test(body)) {
    return {
      isStatic: false,
      flavor,
      shape: "template-literal",
      declarations: [],
      dynamicReason: "template-interpolation",
    };
  }
  const declarations = parseCssDeclarations(body);
  if (declarations.length === 0) {
    return {
      isStatic: false,
      flavor,
      shape: "template-literal",
      declarations: [],
      dynamicReason: "unknown-shape",
    };
  }
  return { isStatic: true, flavor, shape: "template-literal", declarations };
};

interface ValueClassification {
  readonly isStatic: boolean;
  readonly value: string;
  readonly reason?: DynamicReason;
}

const classifyValue = (raw: string): ValueClassification => {
  const value = raw.trim();
  if (value === "") return { isStatic: false, value, reason: "unknown-shape" };

  // Template interpolation inside any value -> dynamic.
  if (TEMPLATE_INTERPOLATION.test(value)) {
    return { isStatic: false, value, reason: "template-interpolation" };
  }
  // Quoted string literal: "red", '8px', `solid`.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return { isStatic: true, value: stripQuotes(value) };
  }
  // Numeric literal (styled/emotion accept bare numbers).
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return { isStatic: true, value };
  }
  // Function call or member access: theme.colors.red, fn(x), rgba(...)
  if (/[.([]/.test(value) || value.includes("(")) {
    return { isStatic: false, value, reason: "props-reference" };
  }
  // Bare identifier other than the CSS-wide keywords -> props/theme reference.
  if (/^[A-Za-z_$]/.test(value)) {
    return { isStatic: false, value, reason: "function-value" };
  }
  // Anything else (e.g. a CSS value used unquoted like red) treat as static
  // CSS so template-style values embedded in object form still extract.
  return { isStatic: true, value };
};

/** Parse `property: value;` pairs out of a CSS-text body (template literals). */
const parseCssDeclarations = (body: string): ExtractedDeclaration[] => {
  const out: ExtractedDeclaration[] = [];
  for (const rawStmt of body.split(";")) {
    const stmt = rawStmt.trim();
    if (stmt === "") continue;
    const colonIdx = stmt.indexOf(":");
    if (colonIdx === -1) continue;
    const property = stmt.slice(0, colonIdx).trim();
    const value = stmt.slice(colonIdx + 1).trim();
    if (property !== "" && value !== "") {
      out.push({ property, value });
    }
  }
  return out;
};

/**
 * Split text on a single-character delimiter, respecting nesting of `{}[]()`
 * and single/double/backtick quotes. Returns the segments WITHOUT the
 * delimiter. Used to walk object-literal members without a full parser.
 */
const splitTopLevel = (text: string, delimiter: string): string[] => {
  const segments: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
    else if (depth === 0 && ch === delimiter) {
      segments.push(text.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(text.slice(start));
  return segments;
};

const findTopLevelColon = (text: string): number => {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{" || ch === "[" || ch === "(") depth += 1;
    else if (ch === "}" || ch === "]" || ch === ")") depth -= 1;
    else if (depth === 0 && ch === ":") return i;
  }
  return -1;
};

const stripQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};
