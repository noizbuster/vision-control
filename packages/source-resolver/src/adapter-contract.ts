import type { SelectionIdentity } from "@vision-control/element-identity";

import type { SourceCandidate } from "./source-candidate.js";

/**
 * Shared adapter contract for styling/framework/source integrations
 * (VC-V1V2-04 / PRD 14.5).
 *
 * Every framework or styling integration (Tailwind, CSS Modules, Next.js, Vue,
 * Svelte, CSS-in-JS, vanilla CSS, future design-token registries) implements
 * the {@link SourceAdapter} interface and registers itself with the
 * {@link AdapterRegistry}. The resolver applies all registered adapters, collects
 * their candidates, enforces the never-wrong-HIGH policy on each, and picks the
 * highest-confidence one.
 *
 * An adapter MAY return multiple candidates when an element's source origin is
 * genuinely ambiguous (e.g. a class defined in two CSS modules). The resolver
 * ranks them and surfaces the non-selected ones as alternatives with their
 * warnings. Adapters MUST NOT return HIGH candidates without strong evidence —
 * the resolver downgrades any that try.
 */

/** Context handed to every adapter for one resolution request. */
export interface AdapterContext {
  /** The inspector's selection identity for the picked element. */
  readonly identity: SelectionIdentity;
  /** CSS class names currently on the element (for class-token adapters). */
  readonly cssClasses?: readonly string[];
  /**
   * Number of live DOM elements sharing the same source id. When > 1 the
   * adapter should treat the origin as instance-ambiguous.
   */
  readonly runtimeInstanceCount?: number;
}

/**
 * One source adapter. `resolve` returns zero or more candidates; the resolver
 * merges, enforces confidence, ranks, and selects. Returning an empty array
 * means "this adapter has nothing to say about this element" (not an error).
 */
export interface SourceAdapter {
  /** Stable adapter id, e.g. `"tailwind-token"`, `"css-modules"`. */
  readonly id: string;
  /** Human-readable description of what this adapter resolves. */
  readonly description?: string;
  /** Resolve candidates for the element described by `context`. */
  resolve(context: AdapterContext): readonly SourceCandidate[];
}
