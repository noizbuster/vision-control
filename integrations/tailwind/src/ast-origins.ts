/**
 * className AST origin detection (VC-V1V2-11).
 *
 * Locates where a className token appears in source so the adapter can cite
 * `ast-origin` evidence (HIGH per the never-wrong-HIGH policy). Only STATIC
 * string literals qualify: a literal inside `className="..."`, or a literal
 * argument to `cn` / `clsx` / `cva`. Dynamic expressions (`props.className`,
 * conditionals, template literals, identifiers) are recorded with `isStatic:
 * false` so the adapter downgrades them to MEDIUM/LOW with an agent-required
 * warning — they NEVER produce a HIGH candidate.
 */
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";

// `@babel/traverse` ships a CJS interop default under ESM; unwrap defensively.
const traverse: typeof _traverse =
  typeof _traverse === "function"
    ? _traverse
    : ((_traverse as { default?: typeof _traverse }).default ?? _traverse);

export type ClassNameCallee = "jsx-className" | "cn" | "clsx" | "cva";

export interface ClassNameAstOrigin {
  readonly workspaceRelativePath: string;
  readonly callee: ClassNameCallee;
  /** 0-based line/column to match the SourceCandidate schema convention. */
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  /** True for proven static string literals; false for dynamic expressions. */
  readonly isStatic: boolean;
  /** The literal class token text (single className, not the whole attribute). */
  readonly token: string;
}

const HELPER_CALLEES: ReadonlySet<string> = new Set(["cn", "clsx", "cva"]);

/** Split a static className string literal into individual class tokens. */
const splitClasses = (value: string): readonly string[] =>
  value.split(/\s+/).filter((c) => c.length > 0);

/**
 * Convert a Babel source location (1-based) to the 0-based SourceCandidate
 * convention. Columns are 0-based in both; only lines shift.
 */
const toOrigin = (
  workspaceRelativePath: string,
  callee: ClassNameCallee,
  token: string,
  loc: t.SourceLocation,
  isStatic: boolean,
): ClassNameAstOrigin => ({
  workspaceRelativePath,
  callee,
  isStatic,
  token,
  startLine: loc.start.line - 1,
  startColumn: loc.start.column,
  endLine: loc.end.line - 1,
  endColumn: loc.end.column,
});

/**
 * For a static string literal, locate each class token WITHIN the literal and
 * record its precise column range. Babel only gives the whole-string range, so
 * the per-token column is computed by scanning the raw string value.
 */
const recordStringLiteralTokens = (
  out: ClassNameAstOrigin[],
  workspaceRelativePath: string,
  callee: ClassNameCallee,
  literal: t.StringLiteral,
): void => {
  const value = literal.value;
  const line = (literal.loc?.start.line ?? 1) - 1;
  const baseCol = literal.loc?.start.column ?? 0;
  // The opening quote occupies column baseCol; tokens start after it.
  let searchFrom = baseCol + 1;
  for (const token of splitClasses(value)) {
    const idx = value.indexOf(token, searchFrom - baseCol - 1);
    if (idx < 0) continue;
    const startCol = baseCol + 1 + idx;
    out.push({
      workspaceRelativePath,
      callee,
      isStatic: true,
      token,
      startLine: line,
      startColumn: startCol,
      endLine: line,
      endColumn: startCol + token.length,
    });
    searchFrom = startCol + token.length;
  }
};

/**
 * Record a DYNAMIC className token (from a conditional literal branch or a
 * template-literal quasi) with `isStatic: false`. These surface so the adapter
 * can attach an agent-required warning, but they NEVER back a HIGH candidate.
 */
const recordDynamicLiteralToken = (
  out: ClassNameAstOrigin[],
  workspaceRelativePath: string,
  callee: ClassNameCallee,
  token: string,
  loc: t.SourceLocation,
): void => {
  out.push(toOrigin(workspaceRelativePath, callee, token, loc, false));
};

const parseSafe = (content: string): t.File | undefined => {
  try {
    return parse(content, {
      sourceType: "unambiguous",
      errorRecovery: true,
      plugins: ["jsx", "typescript", "classProperties", "objectRestSpread"],
    });
  } catch {
    return undefined;
  }
};

/**
 * Walk helper-call arguments (`cn`, `clsx`, `cva`) and the JSX `className`
 * attribute, recording every static token and every dynamic literal branch.
 */
const collectFromNode = (
  out: ClassNameAstOrigin[],
  workspaceRelativePath: string,
  callee: ClassNameCallee,
  node: t.Node,
): void => {
  // Static string literal argument.
  if (t.isStringLiteral(node)) {
    recordStringLiteralTokens(out, workspaceRelativePath, callee, node);
    return;
  }
  // Conditional expression: both branches may be literals, but the className
  // is runtime-chosen -> NOT static. Record each literal token as dynamic.
  if (t.isConditionalExpression(node)) {
    for (const branch of [node.consequent, node.alternate]) {
      if (t.isStringLiteral(branch) && branch.loc !== null && branch.loc !== undefined) {
        for (const token of splitClasses(branch.value)) {
          recordDynamicLiteralToken(out, workspaceRelativePath, callee, token, branch.loc);
        }
      }
    }
    return;
  }
  // Array of class tokens (cn/clsx accept arrays). Static string elements count.
  if (t.isArrayExpression(node)) {
    for (const el of node.elements) {
      if (el !== null && el !== undefined) collectFromNode(out, workspaceRelativePath, callee, el);
    }
  }
  // Any other expression (identifier, member, call, template literal) is dynamic;
  // no static token can be claimed. Intentionally no else branch.
};

const handleJsxClassNameAttribute = (
  out: ClassNameAstOrigin[],
  workspaceRelativePath: string,
  attribute: t.JSXAttribute,
): void => {
  const value = attribute.value;
  // className="gap-2 flex" — static string.
  if (value !== null && t.isStringLiteral(value)) {
    recordStringLiteralTokens(out, workspaceRelativePath, "jsx-className", value);
    return;
  }
  // className={EXPR} — expression container.
  if (t.isJSXExpressionContainer(value)) {
    const expr = value.expression;
    // Direct helper call: className={cn(...)}.
    if (
      t.isCallExpression(expr) &&
      (t.isIdentifier(expr.callee) || t.isMemberExpression(expr.callee))
    ) {
      const name = t.isIdentifier(expr.callee) ? expr.callee.name : "";
      if (HELPER_CALLEES.has(name)) {
        for (const arg of expr.arguments) {
          if (arg !== null && arg !== undefined) {
            collectFromNode(out, workspaceRelativePath, name as ClassNameCallee, arg);
          }
        }
        return;
      }
    }
    // Any other expression is dynamic; no static token is claimed.
    collectFromNode(out, workspaceRelativePath, "jsx-className", expr);
  }
};

const handleStandaloneHelperCall = (
  out: ClassNameAstOrigin[],
  workspaceRelativePath: string,
  node: t.CallExpression,
): void => {
  if (!t.isIdentifier(node.callee)) return;
  const name = node.callee.name;
  if (!HELPER_CALLEES.has(name)) return;
  for (const arg of node.arguments) {
    if (arg !== null && arg !== undefined) {
      collectFromNode(out, workspaceRelativePath, name as ClassNameCallee, arg);
    }
  }
};

/**
 * Find every className AST origin in a source file. Static literals carry
 * `isStatic: true`; dynamic-expression literals carry `isStatic: false`.
 * Returns an empty array for empty source, source without className, or
 * source with syntax errors (degrades gracefully — never throws).
 */
export const findClassNameOrigins = (
  content: string,
  workspaceRelativePath: string,
): readonly ClassNameAstOrigin[] => {
  if (content.trim().length === 0) return [];
  const ast = parseSafe(content);
  if (ast === undefined) return [];
  const out: ClassNameAstOrigin[] = [];
  traverse(ast, {
    JSXAttribute(path) {
      const node = path.node;
      if (node.name.type !== "JSXIdentifier") return;
      if (node.name.name !== "className") return;
      handleJsxClassNameAttribute(out, workspaceRelativePath, node);
    },
    CallExpression(path) {
      handleStandaloneHelperCall(out, workspaceRelativePath, path.node);
    },
  });
  return out;
};

/**
 * Find the origin for a specific className token. Prefers a STATIC origin
 * (isStatic: true); if only dynamic origins exist, returns the first dynamic
 * one so the adapter can still attach an agent-required warning.
 */
export const findOriginForClass = (
  origins: readonly ClassNameAstOrigin[],
  className: string,
): ClassNameAstOrigin | undefined => {
  const staticHit = origins.find((o) => o.isStatic && o.token === className);
  if (staticHit !== undefined) return staticHit;
  return origins.find((o) => !o.isStatic && o.token === className);
};
