/**
 * Script → source map → module-candidate origin pipeline (ADR-019 C4).
 *
 * Systematic JS map collection for the content script. Missing maps yield no
 * origins for that script (never throw). Cap exhaustion sets
 * `originsTruncated` and skips the remainder. Does not claim HIGH confidence
 * (no DOM→JSX HIGH; map+range HIGH is task 11 / CSS range path).
 */

import { createCapBudget, resolveCaps } from "./caps.js";
import { fetchTextCapped } from "./fetch-text.js";
import { normalizeMapSourcePath } from "./normalize-source-path.js";
import { parseSourceMap } from "./source-map.js";
import { extractSourceMappingUrl, resolveMapUrl } from "./source-mapping-url.js";
import type {
  MapOrigin,
  ResolveJsOriginsOptions,
  ResolveJsOriginsResult,
  ScriptElementLike,
  ScriptInput,
} from "./types.js";

/** Cached map parse result for one resolve pass (dedupe by map URL). */
interface CachedMap {
  readonly mapUrl: string;
  readonly parsed: ReturnType<typeof parseSourceMap>;
  readonly loadFailed: boolean;
}

/**
 * Enumerate page scripts into {@link ScriptInput} values.
 *
 * Content script: `scriptsFromElements(document.querySelectorAll("script"))`.
 * Skips empty nodes. External scripts keep `src`; inline keep text.
 */
export const scriptsFromElements = (elements: Iterable<ScriptElementLike>): ScriptInput[] => {
  const out: ScriptInput[] = [];
  for (const el of elements) {
    const src = el.src.trim();
    const text = el.textContent ?? "";
    if (src.length === 0 && text.length === 0) continue;
    const input: ScriptInput = {
      ...(src.length > 0 ? { scriptSrc: src } : {}),
      ...(text.length > 0 ? { scriptText: text } : {}),
    };
    out.push(input);
  }
  return out;
};

/**
 * Resolve module-candidate origins from script source maps under C4 caps.
 *
 * Given: scripts with src and/or text.
 * When: maps are available via sourceMappingURL or explicit mapUrl.
 * Then: one medium-confidence `js` origin per unique normalized module path;
 * empty origins and no throw when maps are missing; originsTruncated on cap exceed.
 */
export const resolveJsOrigins = async (
  scripts: readonly ScriptInput[],
  options: ResolveJsOriginsOptions,
): Promise<ResolveJsOriginsResult> => {
  const caps = resolveCaps(options.caps);
  const now = options.now ?? Date.now;
  const budget = createCapBudget(now());
  const origins: MapOrigin[] = [];
  const seenPaths = new Set<string>();
  const mapCache = new Map<string, CachedMap>();
  const scriptTextCache = new Map<string, string | undefined>();

  for (const script of scripts) {
    if (budget.truncated) break;

    const sourceUrl = script.scriptSrc;
    const mapUrl = await discoverMapUrl(script, {
      fetch: options.fetch,
      caps,
      budget,
      now,
      scriptTextCache,
    });

    if (mapUrl === undefined) {
      continue;
    }

    if (budget.truncated) break;

    const cached = await loadMap(mapUrl, {
      fetch: options.fetch,
      caps,
      budget,
      now,
      mapCache,
    });

    if (cached === undefined || cached.loadFailed || cached.parsed === undefined) {
      continue;
    }

    for (const rawSource of cached.parsed.sources) {
      const relativePath = normalizeMapSourcePath(rawSource);
      if (relativePath === undefined) continue;
      if (seenPaths.has(relativePath)) continue;
      seenPaths.add(relativePath);

      const origin: MapOrigin = {
        ...(sourceUrl !== undefined ? { sourceUrl } : {}),
        mapUrl,
        relativePath,
        // Module path only — no generated→original range. Task 11 formalizes
        // never-wrong-HIGH; systematic collection stays medium.
        confidence: "medium",
        kind: "js",
        warnings: ["module-path-only"],
      };
      origins.push(origin);
    }
  }

  return {
    origins,
    originsTruncated: budget.truncated,
  };
};

interface DiscoverContext {
  readonly fetch: ResolveJsOriginsOptions["fetch"];
  readonly caps: ReturnType<typeof resolveCaps>;
  readonly budget: ReturnType<typeof createCapBudget>;
  readonly now: () => number;
  readonly scriptTextCache: Map<string, string | undefined>;
}

const discoverMapUrl = async (
  script: ScriptInput,
  ctx: DiscoverContext,
): Promise<string | undefined> => {
  if (script.mapUrl !== undefined && script.mapUrl.length > 0) {
    return resolveMapUrl(script.mapUrl, script.scriptSrc) ?? script.mapUrl;
  }

  let text = script.scriptText;
  if (text === undefined && script.scriptSrc !== undefined) {
    const src = script.scriptSrc;
    if (ctx.scriptTextCache.has(src)) {
      text = ctx.scriptTextCache.get(src);
    } else {
      const fetched = await fetchTextCapped({
        fetch: ctx.fetch,
        url: src,
        caps: ctx.caps,
        budget: ctx.budget,
        now: ctx.now,
        countTowardMapCaps: false,
      });
      text = fetched.ok ? fetched.text : undefined;
      ctx.scriptTextCache.set(src, text);
    }
  }

  if (text === undefined) return undefined;
  const ref = extractSourceMappingUrl(text);
  if (ref === undefined) return undefined;
  return resolveMapUrl(ref, script.scriptSrc);
};

interface LoadMapContext {
  readonly fetch: ResolveJsOriginsOptions["fetch"];
  readonly caps: ReturnType<typeof resolveCaps>;
  readonly budget: ReturnType<typeof createCapBudget>;
  readonly now: () => number;
  readonly mapCache: Map<string, CachedMap>;
}

const loadMap = async (mapUrl: string, ctx: LoadMapContext): Promise<CachedMap | undefined> => {
  const existing = ctx.mapCache.get(mapUrl);
  if (existing !== undefined) return existing;

  const fetched = await fetchTextCapped({
    fetch: ctx.fetch,
    url: mapUrl,
    caps: ctx.caps,
    budget: ctx.budget,
    now: ctx.now,
    countTowardMapCaps: true,
  });

  if (!fetched.ok) {
    const failed: CachedMap = { mapUrl, parsed: undefined, loadFailed: true };
    ctx.mapCache.set(mapUrl, failed);
    return failed;
  }

  let json: unknown;
  try {
    json = JSON.parse(fetched.text) as unknown;
  } catch {
    const failed: CachedMap = { mapUrl, parsed: undefined, loadFailed: true };
    ctx.mapCache.set(mapUrl, failed);
    return failed;
  }

  const parsed = parseSourceMap(json);
  const entry: CachedMap = {
    mapUrl,
    parsed,
    loadFailed: parsed === undefined,
  };
  ctx.mapCache.set(mapUrl, entry);
  return entry;
};
