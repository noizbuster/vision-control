/**
 * Design-token registry contract and in-memory implementation (VC-V1V2-18).
 *
 * The registry ingests design tokens from heterogeneous sources — Tailwind v3
 * config, Tailwind v4 `@theme` CSS variables, plain CSS custom properties, CSS
 * Modules `@value` exports, and framework adapter hints — and presents a single
 * unified lookup surface with source provenance on every token.
 *
 * Design rules (load-bearing):
 * - Framework-agnostic: no source kind is privileged. The registry never
 *   imports Tailwind or any framework; callers register tokens.
 * - In-process only: no remote service, no global singleton. Each consumer
 *   constructs its own {@link InMemoryTokenRegistry}. State never leaks across
 *   daemon sessions except by explicit serialisation.
 * - Provenance-preserving: multiple sources may register the same token NAME.
 *   When their VALUES agree the registry merges provenance (richer attribution).
 *   When their values disagree the registry records a conflict (see
 *   `conflict-detection.ts`) and `lookup` returns the first-registered value so
 *   resolution is deterministic, never random.
 * - Malformed-input defense: every `register` call validates the token through
 *   {@link DesignTokenSchema}; a bad category or missing name throws at the
 *   boundary rather than corrupting the registry.
 */
import { z } from "zod";

import { TOKEN_CATEGORIES, type TokenCategory, TokenCategorySchema } from "./categories.js";
import {
  TOKEN_SOURCE_KINDS,
  type TokenProvenance,
  TokenProvenanceSchema,
  type TokenSourceKind,
} from "./provenance.js";

/**
 * One registered design token. A token is identified by `name` within its
 * `category`; `value` is the raw CSS value string. `px` is the numeric pixel
 * equivalent for spacing tokens (used by nearest-match suggestion logic in
 * downstream consumers). `aliases` are framework-specific references that
 * should resolve to this token (e.g. a Tailwind utility key, a CSS variable
 * name without the `--` prefix).
 */
export const DesignTokenSchema = z.object({
  name: z.string().min(1),
  category: TokenCategorySchema,
  value: z.string(),
  px: z.number().optional(),
  provenance: TokenProvenanceSchema,
  aliases: z.array(z.string().min(1)).optional(),
});

export type DesignToken = z.infer<typeof DesignTokenSchema>;

/**
 * Validate a token at the ingest boundary. Throws on bad category/name/value.
 */
export const createDesignToken = (
  input: Omit<DesignToken, "aliases"> & { readonly aliases?: readonly string[] },
): DesignToken =>
  DesignTokenSchema.parse({
    ...input,
    ...(input.aliases !== undefined ? { aliases: [...input.aliases] } : {}),
  });

/**
 * A token after the registry merges agreeing sources. `provenance` lists every
 * source that registered this name with the SAME value. On a value conflict the
 * registry still returns a {@link ResolvedToken} (first-registered value wins,
 * deterministically) and the conflict is surfaced separately via
 * {@link detectTokenConflicts}.
 */
export interface ResolvedToken {
  readonly name: string;
  readonly category: TokenCategory;
  readonly value: string;
  readonly px?: number;
  readonly provenance: readonly TokenProvenance[];
  readonly aliases: readonly string[];
}

/**
 * Compact summary of the registry, emitted into the compiled agent context so a
 * coding agent knows which token categories and sources are in play without
 * receiving the full token list (which can be large).
 */
export interface TokenRegistrySummary {
  /** Number of unique token names (not raw registrations). */
  readonly totalTokens: number;
  /** Count of resolved tokens per category (categories with zero are omitted). */
  readonly categories: Readonly<Record<string, number>>;
  /** Distinct provenance source kinds present in the registry. */
  readonly sources: readonly TokenSourceKind[];
  /** Number of token names with conflicting values across sources. */
  readonly conflictCount: number;
}

/**
 * The registry contract. Implementations must be deterministic: the same
 * sequence of `register` calls produces the same `lookup`/`summary` output.
 */
export interface TokenRegistry {
  /** Register one token. Validates at the boundary. */
  register(token: DesignToken): void;
  /** Register many tokens (bulk-load path for config ingest). */
  registerMany(tokens: readonly DesignToken[]): void;
  /** Look up a resolved token by name. First-registered value wins on conflict. */
  lookup(name: string): ResolvedToken | undefined;
  /** Look up by a framework alias (e.g. utility key or `--var` name). */
  lookupByAlias(alias: string): ResolvedToken | undefined;
  /** All resolved tokens in a category. */
  byCategory(category: TokenCategory): readonly ResolvedToken[];
  /** All resolved tokens (one entry per unique name), in first-registration order. */
  all(): readonly ResolvedToken[];
  /** All raw registrations in insertion order (for conflict-detail inspection). */
  registrations(): readonly DesignToken[];
  /** Compact summary for context export. */
  summary(): TokenRegistrySummary;
  /** Remove every registration. */
  clear(): void;
  /** Number of unique token names. */
  readonly size: number;
}

/** Merge a list of raw registrations for the same name into a resolved token. */
const resolveToken = (name: string, raws: readonly DesignToken[]): ResolvedToken => {
  if (raws.length === 0) throw new Error(`resolveToken: no registrations for "${name}"`);
  const first = raws[0];
  if (first === undefined) throw new Error(`resolveToken: undefined entry for "${name}"`);
  // First-registered value wins (deterministic). px taken from the winning entry.
  const winners = raws.filter((r) => r.value === first.value);
  const provenance: TokenProvenance[] = winners.map((r) => r.provenance);
  const aliases = new Set<string>();
  for (const r of raws) {
    if (r.aliases !== undefined) for (const a of r.aliases) aliases.add(a);
  }
  const base: ResolvedToken = {
    name,
    category: first.category,
    value: first.value,
    provenance,
    aliases: [...aliases],
  };
  return first.px !== undefined ? { ...base, px: first.px } : base;
};

/**
 * In-memory token registry. Construct one per daemon session / test. No global
 * state, no remote calls. Insertion order is preserved so `lookup` and
 * conflict resolution are deterministic.
 */
export class InMemoryTokenRegistry implements TokenRegistry {
  private readonly byName = new Map<string, DesignToken[]>();
  private readonly order: string[] = [];
  private readonly aliasIndex = new Map<string, string>();

  register(token: DesignToken): void {
    const validated = DesignTokenSchema.parse(token);
    const existing = this.byName.get(validated.name);
    if (existing === undefined) {
      this.byName.set(validated.name, [validated]);
      this.order.push(validated.name);
    } else {
      existing.push(validated);
    }
    if (validated.aliases !== undefined) {
      for (const alias of validated.aliases) {
        // First registration of an alias wins; later ones do not overwrite so
        // resolution stays deterministic and insertion-order-stable.
        if (!this.aliasIndex.has(alias)) {
          this.aliasIndex.set(alias, validated.name);
        }
      }
    }
  }

  registerMany(tokens: readonly DesignToken[]): void {
    for (const token of tokens) this.register(token);
  }

  lookup(name: string): ResolvedToken | undefined {
    const raws = this.byName.get(name);
    if (raws === undefined) return undefined;
    return resolveToken(name, raws);
  }

  lookupByAlias(alias: string): ResolvedToken | undefined {
    const name = this.aliasIndex.get(alias);
    if (name === undefined) return undefined;
    return this.lookup(name);
  }

  byCategory(category: TokenCategory): readonly ResolvedToken[] {
    const out: ResolvedToken[] = [];
    for (const name of this.order) {
      const resolved = this.lookup(name);
      if (resolved !== undefined && resolved.category === category) out.push(resolved);
    }
    return out;
  }

  all(): readonly ResolvedToken[] {
    return this.order
      .map((name) => this.lookup(name))
      .filter((t): t is ResolvedToken => t !== undefined);
  }

  registrations(): readonly DesignToken[] {
    const out: DesignToken[] = [];
    for (const name of this.order) {
      const raws = this.byName.get(name);
      if (raws !== undefined) out.push(...raws);
    }
    return out;
  }

  summary(): TokenRegistrySummary {
    const categories: Record<string, number> = {};
    const sourceSet = new Set<TokenSourceKind>();
    for (const token of this.all()) {
      categories[token.category] = (categories[token.category] ?? 0) + 1;
      for (const p of token.provenance) sourceSet.add(p.kind);
    }
    // Source kinds reflect EVERY raw registration (including conflicting
    // dissenters), so the agent sees the full attribution picture. Conflict
    // count signals how many names had disagreement.
    for (const raw of this.registrations()) {
      sourceSet.add(raw.provenance.kind);
    }
    let conflictCount = 0;
    for (const name of this.order) {
      const raws = this.byName.get(name);
      if (raws === undefined) continue;
      const values = new Set(raws.map((r) => r.value));
      if (values.size > 1) conflictCount += 1;
    }
    return {
      totalTokens: this.order.length,
      categories,
      sources: [...sourceSet],
      conflictCount,
    };
  }

  clear(): void {
    this.byName.clear();
    this.order.length = 0;
    this.aliasIndex.clear();
  }

  get size(): number {
    return this.order.length;
  }
}

/**
 * Re-export the const tuples so consumers can iterate categories/sources without
 * importing two modules. These are the SAME arrays as in the leaf modules.
 */
export { TOKEN_CATEGORIES, TOKEN_SOURCE_KINDS };
