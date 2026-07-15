/**
 * CSS rule → stylesheet → source map → origin pipeline (ADR-019 C4).
 *
 * Runs with an injected fetch (content-script page network). Missing maps yield
 * empty origins for that rule — never throw. Cap exhaustion sets
 * `originsTruncated` and skips the remainder.
 */

import { createCapBudget, resolveCaps } from "./caps.js";
import { assignMapOriginConfidence, enforceMapOriginNeverWrongHigh } from "./confidence-policy.js";
import { fetchTextCapped } from "./fetch-text.js";
import { parseSourceMap } from "./source-map.js";
import { extractSourceMappingUrl, resolveMapUrl } from "./source-mapping-url.js";
import type {
  CssRuleInput,
  MapOrigin,
  ResolveCssOriginsOptions,
  ResolveCssOriginsResult,
} from "./types.js";

/** Cached map parse result for one resolve pass (dedupe by map URL). */
interface CachedMap {
  readonly mapUrl: string;
  readonly parsed: ReturnType<typeof parseSourceMap>;
  readonly loadFailed: boolean;
}

/**
 * Resolve map origins for a list of CSS rules under C4 caps.
 *
 * Given: CSS rules with selector + stylesheet identity.
 * When: maps are available via sourceMappingURL or explicit mapUrl.
 * Then: origins with relativePath/range when sourcesContent allows; empty
 * origins and no throw when maps are missing; originsTruncated on cap exceed.
 */
export const resolveCssOrigins = async (
  rules: readonly CssRuleInput[],
  options: ResolveCssOriginsOptions,
): Promise<ResolveCssOriginsResult> => {
  const caps = resolveCaps(options.caps);
  const now = options.now ?? Date.now;
  const budget = createCapBudget(now());
  const origins: MapOrigin[] = [];
  const mapCache = new Map<string, CachedMap>();
  const stylesheetTextCache = new Map<string, string | undefined>();

  for (const rule of rules) {
    if (budget.truncated) break;

    const sourceUrl = rule.stylesheetHref;
    const mapUrl = await discoverMapUrl(rule, {
      fetch: options.fetch,
      caps,
      budget,
      now,
      stylesheetTextCache,
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

    const range = cached.parsed.findSelectorRange(rule.selectorText);
    const decision = assignMapOriginConfidence({
      hasMap: true,
      hasRange: range !== undefined,
    });
    if (decision.confidence === "none") {
      continue;
    }

    const origin: MapOrigin = enforceMapOriginNeverWrongHigh({
      ...(sourceUrl !== undefined ? { sourceUrl } : {}),
      mapUrl,
      ...(range !== undefined
        ? {
            relativePath: range.sourceFile,
            startLine: range.startLine + 1,
            startColumn: range.startColumn,
            endLine: range.endLine + 1,
            endColumn: range.endColumn,
            ...(range.snippet !== undefined ? { snippet: range.snippet } : {}),
          }
        : firstSourceAsRelative(cached.parsed.sources)),
      confidence: decision.confidence,
      kind: "css",
      warnings: [...decision.warnings],
    });
    origins.push(origin);
  }

  return {
    origins,
    originsTruncated: budget.truncated,
  };
};

const firstSourceAsRelative = (sources: readonly string[]): { readonly relativePath?: string } => {
  const first = sources[0];
  return first !== undefined ? { relativePath: first } : {};
};

interface DiscoverContext {
  readonly fetch: ResolveCssOriginsOptions["fetch"];
  readonly caps: ReturnType<typeof resolveCaps>;
  readonly budget: ReturnType<typeof createCapBudget>;
  readonly now: () => number;
  readonly stylesheetTextCache: Map<string, string | undefined>;
}

const discoverMapUrl = async (
  rule: CssRuleInput,
  ctx: DiscoverContext,
): Promise<string | undefined> => {
  if (rule.mapUrl !== undefined && rule.mapUrl.length > 0) {
    return resolveMapUrl(rule.mapUrl, rule.stylesheetHref) ?? rule.mapUrl;
  }

  let text = rule.stylesheetText;
  if (text === undefined && rule.stylesheetHref !== undefined) {
    const href = rule.stylesheetHref;
    if (ctx.stylesheetTextCache.has(href)) {
      text = ctx.stylesheetTextCache.get(href);
    } else {
      const fetched = await fetchTextCapped({
        fetch: ctx.fetch,
        url: href,
        caps: ctx.caps,
        budget: ctx.budget,
        now: ctx.now,
        countTowardMapCaps: false,
      });
      text = fetched.ok ? fetched.text : undefined;
      ctx.stylesheetTextCache.set(href, text);
    }
  }

  if (text === undefined) return undefined;
  const ref = extractSourceMappingUrl(text);
  if (ref === undefined) return undefined;
  return resolveMapUrl(ref, rule.stylesheetHref);
};

interface LoadMapContext {
  readonly fetch: ResolveCssOriginsOptions["fetch"];
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
