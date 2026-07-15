/**
 * Merge CSS + JS (and any future) origin resolve results for snapshot compile.
 *
 * Truncation is sticky: if any pass set `originsTruncated`, the merged result
 * is truncated. Origins are concatenated in call order (CSS then JS is typical).
 */

import type { MapOrigin } from "./types.js";

/** One resolve pass result (CSS, JS, or a pre-built partial). */
export interface OriginResolveResult {
  readonly origins: readonly MapOrigin[];
  readonly originsTruncated: boolean;
}

/** Merged origins ready for {@link compileVisionContextSnapshot} inputs. */
export interface MergedOriginResults {
  readonly origins: readonly MapOrigin[];
  readonly originsTruncated: boolean;
}

/**
 * Combine multiple map-origin resolve results into one snapshot-ready payload.
 *
 * Empty inputs yield `{ origins: [], originsTruncated: false }` — never throws.
 */
export const mergeOriginResults = (
  results: readonly OriginResolveResult[],
): MergedOriginResults => {
  if (results.length === 0) {
    return { origins: [], originsTruncated: false };
  }

  const origins: MapOrigin[] = [];
  let originsTruncated = false;

  for (const result of results) {
    for (const origin of result.origins) {
      origins.push(origin);
    }
    if (result.originsTruncated) {
      originsTruncated = true;
    }
  }

  return { origins, originsTruncated };
};
