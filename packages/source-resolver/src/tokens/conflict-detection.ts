/**
 * Token conflict detection (VC-V1V2-18).
 *
 * A conflict occurs when two or more sources register the SAME token name with
 * DIFFERENT values. Same name + same value is agreement (merged provenance, no
 * conflict). The detection is a pure function over a raw-registration list so it
 * can be reused by the registry's `summary()`, by the context compiler (to emit
 * warnings), and by tests — without coupling to the registry implementation.
 *
 * The output is an advisory WARNING, never a hard error: the registry still
 * resolves the first-registered value so downstream consumers keep working. The
 * warning surfaces the ambiguity so an agent or human can reconcile the sources.
 */
import type { TokenCategory } from "./categories.js";
import type { TokenProvenance } from "./provenance.js";
import type { DesignToken } from "./registry.js";

/** One token name whose sources disagree on value. */
export interface TokenConflict {
  /** The conflicting token name. */
  readonly name: string;
  /** Category of the conflicting token (taken from the first registration). */
  readonly category: TokenCategory;
  /** The distinct values sources registered for this name. */
  readonly distinctValues: readonly string[];
  /** Every source that registered this name (all values, for attribution). */
  readonly sources: readonly TokenProvenance[];
}

/**
 * Detect every token name in `tokens` whose sources registered more than one
 * distinct value. Returns conflicts in first-seen order of the name. An empty
 * array means no conflicts.
 */
export const detectTokenConflicts = (tokens: readonly DesignToken[]): readonly TokenConflict[] => {
  const byName = new Map<string, DesignToken[]>();
  const order: string[] = [];
  for (const token of tokens) {
    const existing = byName.get(token.name);
    if (existing === undefined) {
      byName.set(token.name, [token]);
      order.push(token.name);
    } else {
      existing.push(token);
    }
  }
  const conflicts: TokenConflict[] = [];
  for (const name of order) {
    const raws = byName.get(name);
    if (raws === undefined) continue;
    const distinct = new Set(raws.map((r) => r.value));
    if (distinct.size <= 1) continue;
    const first = raws[0];
    if (first === undefined) continue;
    conflicts.push({
      name,
      category: first.category,
      distinctValues: [...distinct],
      sources: raws.map((r) => r.provenance),
    });
  }
  return conflicts;
};

/** Stable warning code surfaced in context-compiler warnings / MCP output. */
export const TOKEN_CONFLICT_WARNING_CODE = "token-conflict";

/**
 * Format a single conflict as a human-readable warning message. Used by callers
 * that need to surface conflicts in the agent context warning list.
 */
export const formatConflictWarning = (conflict: TokenConflict): string =>
  `token conflict: "${conflict.name}" has ${conflict.distinctValues.length} distinct values ` +
  `(${conflict.distinctValues.map((v) => `"${v}"`).join(", ")}) from sources ` +
  `(${conflict.sources.map((s) => s.kind).join(", ")})`;
