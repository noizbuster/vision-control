/**
 * CSS Modules source adapter (VC-V1V2-12).
 *
 * Maps a runtime hashed CSS Modules class to its source origin using:
 * 1. A bundler-generated manifest (hashed → local name + module path).
 * 2. A CSS source map (module path → original source range).
 * 3. Composition tracing (composes → multiple candidates).
 * 4. Conservative hash-name heuristic (last resort, MEDIUM/LOW only).
 *
 * The adapter is a {@link SourceAdapter} implementation. It is constructed via
 * {@link createCssModulesAdapter} with optional manifest/source-map data. The
 * exported {@link CSS_MODULES_ADAPTER} singleton has no data loaded and falls
 * back to hash heuristics.
 *
 * **Confidence policy** (never-wrong-HIGH):
 * - Manifest + source-map + range → **HIGH** (evidence: manifest + source-map).
 * - Manifest alone (no source map/range) → **MEDIUM** (evidence: manifest).
 * - Hash heuristic only → **MEDIUM/LOW** (evidence: text-search, never HIGH).
 */

import type { CssModulesManifest } from "./manifest.js";
import { produceCandidates } from "./source-candidates.js";
import type { CssSourceMap } from "./source-map.js";
import type { AdapterContextLike, SourceAdapterLike } from "./types.js";

/** Optional data injected into a CSS Modules adapter instance. */
export interface CssModulesAdapterData {
  readonly manifest?: CssModulesManifest;
  readonly sourceMaps?: ReadonlyMap<string, CssSourceMap>;
}

/**
 * Factory: create a CSS Modules source adapter with injected manifest and
 * source-map data. Callers that have loaded a bundler manifest should use this
 * instead of the bare {@link CSS_MODULES_ADAPTER} singleton.
 */
export const createCssModulesAdapter = (data: CssModulesAdapterData = {}): SourceAdapterLike => ({
  id: "css-modules",
  description:
    "CSS Modules hashed-class-to-source mapping (manifest + source map + composition tracing)",
  resolve: (context: AdapterContextLike) => {
    const classes = context.cssClasses;
    if (classes === undefined || classes.length === 0) return [];

    const all = [];
    for (const className of classes) {
      const candidates = produceCandidates(className, data);
      for (const c of candidates) {
        all.push(c);
      }
    }
    return all;
  },
});

/**
 * Default singleton adapter — no manifest or source-map data loaded.
 *
 * Falls back to hash-name heuristics for CSS-Modules-looking classes. Returns
 * MEDIUM/LOW candidates with "agent-required" warnings, NEVER HIGH.
 *
 * Callers with manifest data should use {@link createCssModulesAdapter}.
 */
export const CSS_MODULES_ADAPTER: SourceAdapterLike = createCssModulesAdapter();
