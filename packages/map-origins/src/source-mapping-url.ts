/**
 * Discover `sourceMappingURL` directives in CSS (or JS) text.
 *
 * Supports relative URLs and `data:` URLs. Last directive wins (source-map
 * consumer convention).
 */

// Matches `//#`, `//@`, `/*#`, `/*@` forms. Capture stops at whitespace or `*/`.
const SOURCE_MAPPING_URL_RE = /(?:\/\*|\/\/)[#@]\s*sourceMappingURL\s*=\s*(\S+?)(?:\s*\*\/|\s*$)/gm;

/**
 * Extract the last `sourceMappingURL` value from stylesheet or script text.
 * Returns `undefined` when none is present.
 */
export const extractSourceMappingUrl = (text: string): string | undefined => {
  let last: string | undefined;
  SOURCE_MAPPING_URL_RE.lastIndex = 0;
  for (const match of text.matchAll(SOURCE_MAPPING_URL_RE)) {
    const value = match[1];
    if (value !== undefined && value.length > 0) {
      last = value.replace(/\*\/$/, "").replace(/\/\*$/, "").trim();
    }
  }
  return last === undefined || last.length === 0 ? undefined : last;
};

/**
 * Resolve a map URL relative to its parent resource URL.
 * Absolute and `data:` URLs are returned unchanged.
 * When `baseUrl` is missing and `mapRef` is relative, returns `undefined`.
 */
export const resolveMapUrl = (mapRef: string, baseUrl: string | undefined): string | undefined => {
  if (mapRef.startsWith("data:")) return mapRef;
  try {
    if (baseUrl !== undefined && baseUrl.length > 0) {
      return new URL(mapRef, baseUrl).href;
    }
    return new URL(mapRef).href;
  } catch {
    return undefined;
  }
};
