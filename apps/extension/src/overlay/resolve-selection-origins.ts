/**
 * Content-script map-origin resolution for the selected element (ADR-019 C4).
 *
 * Collects matching CSS rules + page scripts, runs map-origins pipelines with
 * page `fetch`, and merges into snapshot-ready `{ origins, originsTruncated }`.
 * Missing maps / empty results never throw — empty origins are valid.
 */

import {
  type FetchLike,
  type MapOrigin,
  mergeOriginResults,
  resolveCssOrigins,
  resolveJsOrigins,
  type ScriptElementLike,
  scriptsFromElements,
} from "@vision-control/map-origins";

/** Result ready for compileVisionContextSnapshot / panel export. */
export interface SelectionOriginsResult {
  readonly origins: readonly MapOrigin[];
  readonly originsTruncated: boolean;
}

export interface ResolveSelectionOriginsOptions {
  /** Page network fetch (content-script injects `globalThis.fetch`). */
  readonly fetch: FetchLike;
  /** Document that owns the element (usually the content-script document). */
  readonly document: Document;
  /** Epoch-ms clock (default `Date.now`). */
  readonly now?: () => number;
}

/**
 * Resolve map origins for a selected element under C4 caps.
 *
 * Given: a selected Element in the page.
 * When: stylesheets/scripts expose source maps the page can fetch.
 * Then: origins for matching CSS rules + JS module candidates; empty array and
 * no throw when maps are missing; originsTruncated when caps skip remainder.
 */
export async function resolveSelectionOrigins(
  element: Element,
  options: ResolveSelectionOriginsOptions,
): Promise<SelectionOriginsResult> {
  const cssRules = collectMatchingCssRules(element, options.document);
  const scripts = scriptsFromElements(listScriptElements(options.document));

  const cssResult = await resolveCssOrigins(cssRules, {
    fetch: options.fetch,
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  const jsResult = await resolveJsOrigins(scripts, {
    fetch: options.fetch,
    ...(options.now !== undefined ? { now: options.now } : {}),
  });

  return mergeOriginResults([cssResult, jsResult]);
}

/**
 * Empty origins payload for panel export when resolution has not run yet.
 * Never throws; safe default for unpaired / pre-resolve export.
 */
export function emptySelectionOrigins(): SelectionOriginsResult {
  return { origins: [], originsTruncated: false };
}

const collectMatchingCssRules = (
  element: Element,
  document: Document,
): readonly {
  readonly selectorText: string;
  readonly stylesheetHref?: string;
  readonly stylesheetText?: string;
}[] => {
  const out: {
    selectorText: string;
    stylesheetHref?: string;
    stylesheetText?: string;
  }[] = [];
  const sheets = document.styleSheets;

  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
    const sheet = sheets.item(sheetIndex);
    if (sheet === null) continue;

    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    const href = typeof sheet.href === "string" && sheet.href.length > 0 ? sheet.href : undefined;
    const stylesheetText = href === undefined ? readInlineStylesheetText(sheet) : undefined;

    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex += 1) {
      const rule = rules.item(ruleIndex);
      if (rule === null || rule.type !== CSSRule.STYLE_RULE) continue;
      const styleRule = rule as CSSStyleRule;
      const selectorText = styleRule.selectorText;
      if (selectorText.length === 0) continue;
      if (!elementMatchesSelector(element, selectorText)) continue;
      out.push({
        selectorText,
        ...(href !== undefined ? { stylesheetHref: href } : {}),
        ...(stylesheetText !== undefined ? { stylesheetText } : {}),
      });
    }
  }

  return out;
};

const readInlineStylesheetText = (sheet: CSSStyleSheet): string | undefined => {
  const owner = sheet.ownerNode;
  if (owner === null || owner.nodeType !== Node.ELEMENT_NODE) return undefined;
  const el = owner as Element;
  if (el.tagName.toLowerCase() !== "style") return undefined;
  const text = el.textContent;
  return text !== null && text.length > 0 ? text : undefined;
};

const elementMatchesSelector = (element: Element, selectorText: string): boolean => {
  try {
    return element.matches(selectorText);
  } catch {
    // Invalid or unsupported selector in this engine.
    return false;
  }
};

const listScriptElements = (document: Document): ScriptElementLike[] => {
  const nodes = document.querySelectorAll("script");
  const out: ScriptElementLike[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes.item(i);
    if (node === null) continue;
    out.push({
      src: typeof node.src === "string" ? node.src : "",
      textContent: node.textContent,
    });
  }
  return out;
};
