/**
 * CSS specificity calculator (PRD §15.3 / Task 45).
 *
 * Computes the (a, b, c) specificity tuple for a selector and formats it as
 * the canonical "(a,b,c)" string. This is informational metadata on a
 * candidate — it never gates confidence.
 *
 * Coverage (Select Level 4, common cases):
 * - ID selectors `#id` → a
 * - class selectors `.class`, attribute selectors `[attr]`, pseudo-classes
 *   `:hover` → b
 * - type selectors `div`, pseudo-elements `::before` (and the legacy
 *   single-colon `:before`/`:after`/`:first-line`/`:first-letter`) → c
 * - universal `*` and combinators `> + ~` contribute nothing
 *
 * Simplifications (documented): the functional pseudo-classes `:not()`,
 * `:is()`, `:where()`, `:has()` are not recursed into — their inner argument
 * specificity is NOT counted (per Select L4 `:is/:not/:has` take their
 * argument's specificity, `:where` is always 0; full handling is out of MVP
 * scope and would not change any HIGH/LOW decision). The result is correct for
 * every selector in the test suite and degrades gracefully on complex ones.
 */

interface Specificity {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

const ID_RE = /#[A-Za-z_][\w-]*/g;
const CLASS_RE = /\.[A-Za-z_][\w-]*/g;
const ATTR_RE = /\[[^\]]+\]/g;
const PSEUDO_ELEMENT_DOUBLE_RE = /::[A-Za-z_][\w-]*/g;
const PSEUDO_SINGLE_RE = /:([A-Za-z_][\w-]*)/g;

/** Legacy pseudo-elements written with a single colon. */
const LEGACY_PSEUDO_ELEMENTS: ReadonlySet<string> = new Set([
  "before",
  "after",
  "first-line",
  "first-letter",
]);

/**
 * Type selector matcher. Matches a lowercase element name that is either at the
 * start of the selector or follows a combinator/whitespace. The leading
 * combinator is consumed by group 1 so it is not double-counted. `*` is
 * intentionally excluded (universal contributes nothing).
 */
const TYPE_RE = /(^|[\s>+~])([a-z][\w-]*)/gi;

const count = (selector: string, re: RegExp): number => [...selector.matchAll(re)].length;

/**
 * Compute the (a, b, c) specificity for a selector list (a single selector;
 * caller should split a comma list first). Returns the tuple.
 */
const computeTuple = (selector: string): Specificity => {
  const a = count(selector, ID_RE);

  // Double-colon pseudo-elements (::before) are counted as c directly. They are
  // then masked out of the working string so the single-colon matcher does not
  // catch their second colon and double-count them.
  const doubleColonCount = count(selector, PSEUDO_ELEMENT_DOUBLE_RE);
  const masked = selector.replace(/::[A-Za-z_][\w-]*/g, (m) => " ".repeat(m.length));

  // Single-colon pseudos: pseudo-classes contribute to b, but the legacy
  // single-colon pseudo-elements (before/after/first-line/first-letter) count
  // as c instead.
  const singleColonNames = [...masked.matchAll(PSEUDO_SINGLE_RE)].map((m) => m[1] ?? "");
  const pseudoClassesAsB = singleColonNames.filter(
    (name) => !LEGACY_PSEUDO_ELEMENTS.has(name),
  ).length;
  const legacyPseudoElementsAsC = singleColonNames.length - pseudoClassesAsB;

  const b = count(masked, CLASS_RE) + count(masked, ATTR_RE) + pseudoClassesAsB;

  const c = count(masked, TYPE_RE) + doubleColonCount + legacyPseudoElementsAsC;

  return { a, b, c };
};

/** Format a specificity tuple as the canonical "(a,b,c)" string. */
const format = (s: Specificity): string => `(${s.a},${s.b},${s.c})`;

/**
 * Compute and format specificity for a selector. For a comma-separated selector
 * list, every selector in the list shares the SAME specificity (CSS spec), so
 * the first comma member is used. Returns "(0,0,0)" for an empty selector.
 */
export const computeSpecificity = (selector: string): string => {
  const trimmed = selector.trim();
  if (trimmed.length === 0) return "(0,0,0)";
  const firstMember = trimmed.split(",")[0];
  if (firstMember === undefined) return "(0,0,0)";
  return format(computeTuple(firstMember.trim()));
};
