/**
 * Tailwind v3 className parser (VC-V1V2-11).
 *
 * Splits a single className token (NOT a space-separated list) into its
 * structural parts: variant prefix chain, utility name, optional scale value,
 * and optional arbitrary value. The parser is purely structural — it does not
 * consult a token whitelist. The registry decides whether a parsed utility is
 * a known Tailwind token; the parser only normalizes the shape so the adapter
 * can route it.
 *
 * Bracket-aware: arbitrary values (`gap-[12px]`, `grid-cols-[repeat(...)]`)
 * may contain characters that look like variant separators (`:`) or value
 * separators (`-`); the parser keeps bracket contents intact.
 */
export interface ParsedClassName {
  /** The raw input token. */
  readonly raw: string;
  /** Utility name without variant prefix or value, e.g. `gap`, `text`, `bg`. */
  readonly utility: string;
  /** Scale key when present, e.g. `2`, `red-500`, `lg`. Undefined for bare/arbitrary. */
  readonly value?: string;
  /** Arbitrary value content (inside `[]`), e.g. `12px`, `#1da1f2`. */
  readonly arbitrary?: string;
  /**
   * Opacity modifier tail when present (v4 + v3.3+ color-utility syntax
   * `bg-red-500/50`). Structural extraction only: the tail after the last
   * depth-0 `/` when it is numeric (`50`) or bracket-arbitrary (`[0.5]` →
   * `0.5`). The `value` field RETAINS the full original including the
   * `/opacity` suffix, so fraction utilities like `w-1/2` are unaffected
   * (value stays `1/2`). Consumers strip opacity only for opacity-capable
   * utilities (color utilities); spacing fraction utilities ignore it.
   */
  readonly opacity?: string;
  /** True for negative utilities (`-mt-2`). */
  readonly negative: boolean;
  /** Variant prefix chain in source order, e.g. `["md", "hover"]`. */
  readonly variants: readonly string[];
}

const VARIANT_SEPARATOR = ":";

/**
 * Split a className on `:` variant separators while keeping bracket contents
 * intact. Returns the segments in source order. Empty segments (stray `:`)
 * are dropped.
 */
const splitVariants = (raw: string): readonly string[] => {
  const segments: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === undefined) continue;
    if (ch === "[") depth += 1;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === VARIANT_SEPARATOR && depth === 0) {
      segments.push(raw.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(raw.slice(start));
  return segments.filter((s) => s.length > 0);
};

/**
 * Bare utilities (no scale value). The presence of a `-` in these names is part
 * of the identifier, not a value separator. Source: Tailwind v3 reference.
 */
const BARE_UTILITIES: ReadonlySet<string> = new Set([
  "block",
  "inline-block",
  "inline",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "hidden",
  "contents",
  "static",
  "fixed",
  "absolute",
  "relative",
  "sticky",
  "items-start",
  "items-center",
  "items-end",
  "items-baseline",
  "items-stretch",
  "justify-start",
  "justify-center",
  "justify-end",
  "justify-between",
  "justify-around",
  "justify-evenly",
  "self-auto",
  "self-start",
  "self-center",
  "self-end",
  "self-stretch",
  "content-center",
  "content-start",
  "content-end",
  "content-between",
  "content-around",
  "content-evenly",
  "flex-row",
  "flex-row-reverse",
  "flex-col",
  "flex-col-reverse",
  "flex-wrap",
  "flex-wrap-reverse",
  "flex-nowrap",
  "flex-1",
  "flex-auto",
  "flex-initial",
  "flex-none",
  "grid-flow-row",
  "grid-flow-col",
  "grid-flow-row-dense",
  "grid-flow-col-dense",
  "text-left",
  "text-center",
  "text-right",
  "text-justify",
  "overflow-auto",
  "overflow-hidden",
  "overflow-visible",
  "overflow-scroll",
  "float-right",
  "float-left",
  "float-none",
  "table",
]);

/**
 * Multi-word utility PREFIXES that take a value. The dash is part of the name,
 * so the value begins after the prefix. Longest-first so a greedy match wins
 * (`rounded-tl` before `rounded-t`).
 */
const MULTI_WORD_PREFIXES: readonly string[] = [
  "translate-x",
  "translate-y",
  "scale-x",
  "scale-y",
  "skew-x",
  "skew-y",
  "gap-x",
  "gap-y",
  "grid-cols",
  "grid-rows",
  "min-w",
  "min-h",
  "max-w",
  "max-h",
  "space-x",
  "space-y",
  "inset-x",
  "inset-y",
  "border-x",
  "border-y",
  "border-t",
  "border-r",
  "border-b",
  "border-l",
  "rounded-t",
  "rounded-b",
  "rounded-l",
  "rounded-r",
  "rounded-tl",
  "rounded-tr",
  "rounded-bl",
  "rounded-br",
  "flex-grow",
  "flex-shrink",
  "animate",
].sort((a, b) => b.length - a.length);

/**
 * Extract the opacity modifier tail from the final segment: the substring
 * after the last `/` at bracket-depth 0, when it is numeric (`/50`) or a
 * bracket-arbitrary value (`/[0.5]` → `0.5`). Returns `undefined` when no
 * recognized opacity modifier is present. Does NOT mutate the input — the
 * caller keeps the full value including `/opacity` so fraction utilities
 * (`w-1/2`) are unaffected.
 */
const extractOpacityTail = (s: string): string | undefined => {
  let depth = 0;
  let slashIdx = -1;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === undefined) continue;
    if (ch === "[") depth += 1;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "/" && depth === 0) slashIdx = i;
  }
  if (slashIdx < 0) return undefined;
  const tail = s.slice(slashIdx + 1);
  if (/^\d{1,3}$/.test(tail)) return tail;
  if (tail.length > 2 && tail.startsWith("[") && tail.endsWith("]")) {
    return tail.slice(1, -1);
  }
  return undefined;
};

/**
 * Parse the final (rightmost) segment. Order matters: arbitrary value first
 * (utility = text before `[`), then bare utility, then known multi-word prefix
 * (`translate-x-4`), then the generic first-dash split (`text-red-500` keeps
 * `red-500` intact as the value).
 */
const parseUtilitySegment = (
  segment: string,
): Pick<ParsedClassName, "utility" | "value" | "arbitrary" | "opacity" | "negative"> | null => {
  let rest = segment;
  let negative = false;
  if (rest.startsWith("-")) {
    negative = true;
    rest = rest.slice(1);
  }
  if (rest.length === 0) return null;

  const opacity = extractOpacityTail(rest);
  const withOpacity = <T extends Record<string, unknown>>(r: T): T =>
    opacity !== undefined ? { ...r, opacity } : r;

  const arbStart = rest.indexOf("[");
  // Skip arbitrary-value detection when the `[` is preceded by `/` — that
  // bracket belongs to an opacity modifier (`bg-brand/[0.5]`), not the value.
  if (arbStart > 0 && rest.endsWith("]") && rest[arbStart - 1] !== "/") {
    let utility = rest.slice(0, arbStart);
    // The utility-prefix dash that introduces the arbitrary value is not part
    // of the utility name (`bg-[#fff]` -> utility `bg`, not `bg-`).
    if (utility.endsWith("-")) utility = utility.slice(0, -1);
    const arbitrary = rest.slice(arbStart + 1, -1);
    if (utility.length === 0 || arbitrary.length === 0) return null;
    return withOpacity({ utility, arbitrary, negative });
  }

  if (BARE_UTILITIES.has(rest)) {
    return withOpacity({ utility: rest, negative });
  }

  for (const prefix of MULTI_WORD_PREFIXES) {
    if (rest.startsWith(`${prefix}-`)) {
      const value = rest.slice(prefix.length + 1);
      if (value.length === 0) return null;
      return withOpacity({ utility: prefix, value, negative });
    }
  }

  const dashIdx = rest.indexOf("-");
  if (dashIdx <= 0) {
    return withOpacity({ utility: rest, negative });
  }
  const utility = rest.slice(0, dashIdx);
  const value = rest.slice(dashIdx + 1);
  if (utility.length === 0 || value.length === 0) return null;
  return withOpacity({ utility, value, negative });
};

/**
 * Parse a single className token. Returns `null` for empty/whitespace input.
 * Structural: does not validate against a token whitelist.
 */
export const parseClassName = (raw: string): ParsedClassName | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const segments = splitVariants(trimmed);
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  if (last === undefined || last.length === 0) return null;

  const parsed = parseUtilitySegment(last);
  if (parsed === null) return null;

  return {
    raw: trimmed,
    variants: segments.slice(0, -1),
    ...parsed,
  };
};
