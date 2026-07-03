/**
 * Prop source-range mapping (VC-V1V2-21).
 *
 * Maps a discovered prop to its precise source range. Literal props produce a
 * concrete range (the AST owns the edit site). Dynamic/computed props produce
 * `undefined` — they get an "agent-required" signal instead of a range.
 *
 * This is the boundary between prop discovery (which locates props) and the
 * suggested-diff generator (which needs a `SourceRange` to produce a
 * deterministic patch). A prop with no range cannot become a suggestion.
 */

import type { SourceRange } from "../suggested-diff/diff-format.js";
import type { DiscoveredProp, PropValueKind } from "./prop-discovery.js";

/** Whether a prop kind can produce a deterministic source range. */
export const hasPropSourceRange = (prop: DiscoveredProp): boolean => prop.sourceRange !== undefined;

/**
 * The framework-specific attribute representation. Used to describe how the
 * range was derived (advisory metadata for the agent).
 */
export type PropRangeOrigin =
  | "jsx-attribute"
  | "vue-attribute"
  | "vue-binding"
  | "svelte-attribute"
  | "svelte-binding";

/** Result of mapping a prop to its source range. */
export interface PropSourceMapping {
  readonly range?: SourceRange;
  readonly origin: PropRangeOrigin;
  /** True when the prop is a safe static literal with a deterministic range. */
  readonly deterministic: boolean;
}

/**
 * Map a discovered prop to its source range and origin.
 *
 * For literal props: returns `{ range, origin, deterministic: true }`.
 * For dynamic props: returns `{ origin, deterministic: false }` with no range.
 */
export const mapPropToSourceRange = (
  prop: DiscoveredProp,
  framework: "jsx" | "vue" | "svelte",
): PropSourceMapping => {
  const origin = resolveOrigin(prop, framework);
  if (prop.sourceRange === undefined) {
    return { origin, deterministic: false };
  }
  return { range: prop.sourceRange, origin, deterministic: true };
};

const resolveOrigin = (
  prop: Pick<DiscoveredProp, "isBinding">,
  framework: "jsx" | "vue" | "svelte",
): PropRangeOrigin => {
  if (framework === "vue") {
    return prop.isBinding === true ? "vue-binding" : "vue-attribute";
  }
  if (framework === "svelte") {
    return prop.isBinding === true ? "svelte-binding" : "svelte-attribute";
  }
  return "jsx-attribute";
};

/** The prop kinds that are eligible for deterministic source-range mapping. */
export const DETERMINISTIC_PROP_KINDS: readonly PropValueKind[] = [
  "literal-string",
  "literal-boolean",
  "literal-number",
];

/** The prop kinds that are dynamic (no deterministic range). */
export const DYNAMIC_PROP_KINDS: readonly PropValueKind[] = [
  "dynamic-expression",
  "member-access",
  "computed",
  "identifier",
];
