/**
 * Tailwind token-aware source adapter (VC-V1V2-11).
 *
 * Implements the {@link SourceAdapter} contract from
 * `@vision-control/source-resolver`. Given a selection's CSS classes, it parses
 * each as a Tailwind v3 utility, resolves the token against a config-backed
 * registry, locates its AST origin in the configured source files, and emits a
 * {@link SourceCandidate} with the never-wrong-HIGH policy enforced by the
 * resolver. Static `className="..."` / `cn` / `clsx` / `cva` literals reach
 * HIGH via `ast-origin`; dynamic `props.className` / conditional / template
 * expressions downgrade to MEDIUM/LOW with an agent-required warning.
 *
 * The default {@link TAILWIND_TOKEN_ADAPTER} uses the built-in Tailwind v3
 * default scale and NO source files — so it never cites ast-origin and tops out
 * at MEDIUM. Use {@link createTailwindTokenAdapter} to wire a parsed config and
 * the workspace's source files for HIGH-resolution behavior.
 */

import {
  type ClassNameAstOrigin,
  findClassNameOrigins,
  findOriginForClass,
} from "./ast-origins.js";
import { type ParsedClassName, parseClassName } from "./class-parser.js";
import type { AdapterContext, SourceAdapter, SourceCandidate } from "./contract.js";
import { buildTailwindCandidate, isTokenBearing } from "./source-candidates.js";
import {
  buildTokenRegistry,
  type TailwindConfigInput,
  type TailwindTokenRegistry,
} from "./tokens.js";
import type { TailwindV4ThemeRegistry } from "./v4-seam.js";

export interface TailwindTokenAdapterOptions {
  /** Parsed Tailwind v3 config. Defaults to the built-in Tailwind v3 scale. */
  readonly config?: TailwindConfigInput;
  /**
   * Source files to scan for className AST origins, keyed by
   * workspace-relative path -> file content. Inline maps are ideal for tests;
   * the daemon wires a real file-set read from the workspace index.
   */
  readonly sourceFiles?: ReadonlyMap<string, string>;
  /**
   * Tailwind v4 `@theme` CSS-variable registry. When provided, the adapter
   * consults it as a fallback when the v3 config registry misses, so v4
   * CSS-first custom tokens (`bg-brand` → `--color-brand`) resolve. A v4
   * registry lookup produces data only — it NEVER yields HIGH confidence on
   * its own (HIGH still requires an `ast-origin`/`marker` via the resolver's
   * never-wrong-HIGH policy).
   */
  readonly v4ThemeRegistry?: TailwindV4ThemeRegistry;
}

interface ClassPlan {
  readonly raw: string;
  readonly parsed: ParsedClassName;
  readonly utility: string;
}

/**
 * Group sibling utilities that target the same CSS property onto one conflict
 * key. `gap`/`gap-x`/`gap-y` collide; padding/margin collide per exact
 * utility (`p-2` vs `p-4`, not `p-2` vs `px-4`).
 */
const conflictGroupKey = (utility: string): string => {
  if (utility === "gap" || utility === "gap-x" || utility === "gap-y") return "gap";
  return utility;
};

/**
 * Create a Tailwind token adapter wired to a config and source-file set.
 */
export const createTailwindTokenAdapter = (
  options: TailwindTokenAdapterOptions = {},
): SourceAdapter => {
  const registry: TailwindTokenRegistry = buildTokenRegistry(options.config);
  const v4ThemeRegistry = options.v4ThemeRegistry;

  const allOrigins: ClassNameAstOrigin[] = [];
  if (options.sourceFiles !== undefined) {
    for (const [relPath, content] of options.sourceFiles) {
      allOrigins.push(...findClassNameOrigins(content, relPath));
    }
  }

  const resolve = (context: AdapterContext): readonly SourceCandidate[] => {
    const classes = context.cssClasses ?? [];
    if (classes.length === 0) return [];

    const plans: ClassPlan[] = [];
    for (const raw of classes) {
      const parsed = parseClassName(raw);
      if (parsed === null) continue;
      if (!isTokenBearing(parsed, registry, v4ThemeRegistry)) continue;
      plans.push({ raw, parsed, utility: parsed.utility });
    }
    if (plans.length === 0) return [];

    const instanceCount = context.runtimeInstanceCount ?? 1;
    const candidates: SourceCandidate[] = [];
    for (const plan of plans) {
      const myKey = conflictGroupKey(plan.utility);
      const conflictPeers = plans
        .filter((other) => other.raw !== plan.raw && conflictGroupKey(other.utility) === myKey)
        .map((other) => other.raw);
      const origin = findOriginForClass(allOrigins, plan.raw);
      const built = buildTailwindCandidate({
        className: plan.raw,
        parsed: plan.parsed,
        registry,
        ...(v4ThemeRegistry !== undefined ? { v4ThemeRegistry } : {}),
        origin,
        runtimeInstanceCount: instanceCount,
        conflictPeers,
      });
      if (built !== undefined) candidates.push(built);
    }
    return candidates;
  };

  return {
    id: "tailwind-token",
    description:
      "Tailwind v3/v4 token-aware editing: resolves className utilities to source origins with nearest-token suggestions",
    resolve,
  };
};

/**
 * Default Tailwind token adapter. Uses the built-in Tailwind v3 default scale
 * and no source files — so it never claims ast-origin and tops out at MEDIUM.
 * Wire {@link createTailwindTokenAdapter} for HIGH-resolution behavior with a
 * parsed config and workspace source files.
 */
export const TAILWIND_TOKEN_ADAPTER: SourceAdapter = createTailwindTokenAdapter();
