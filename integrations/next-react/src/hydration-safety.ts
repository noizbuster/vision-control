/**
 * Hydration safety utilities (VC-V1V2-13).
 *
 * Next.js server-renders HTML on the server and hydrates it on the client.
 * React's hydration requires the server-rendered HTML and client-rendered
 * HTML to match. If the source markers were non-deterministic (different on
 * server vs client), React would emit a hydration mismatch warning and
 * potentially discard the server HTML.
 *
 * The key invariant: source markers are PURE functions of
 * `(workspaceRelativePath, sourceRange, fingerprint)`. The same source
 * location produces the same marker token on every render, server or client.
 * There is no randomness, no timestamp, no counter — the source id is a
 * truncated SHA-256 hash. Therefore server and client markers are ALWAYS
 * identical for the same element, and hydration is safe by construction.
 *
 * These utilities verify that invariant at test time and provide a runtime
 * assertion for CI.
 */

export interface HydrationCheckInput {
  readonly serverHtml: string;
  readonly clientHtml: string;
}

export interface HydrationCheckResult {
  readonly safe: boolean;
  readonly reason: string;
  readonly mismatchedAttributes: readonly string[];
}

const MARKER_RE = /data-vc-source="([^"]*)"/g;

/**
 * Extract all `data-vc-source` marker values from an HTML string, in document
 * order. Used to compare server vs client markers for hydration safety.
 */
export const extractMarkers = (html: string): readonly string[] => {
  const markers: string[] = [];
  MARKER_RE.lastIndex = 0;
  for (;;) {
    const match = MARKER_RE.exec(html);
    if (match === null) break;
    const value = match[1];
    if (value !== undefined) markers.push(value);
  }
  return markers;
};

/**
 * Verify that server-rendered and client-rendered markers are identical for
 * hydration safety.
 *
 * The markers MUST appear in the same order with the same values. If they
 * differ, hydration would break. This function is the negative-test surface:
 * it catches any non-determinism introduced into the marker pipeline.
 */
export const assertHydrationSafe = (input: HydrationCheckInput): HydrationCheckResult => {
  const serverMarkers = extractMarkers(input.serverHtml);
  const clientMarkers = extractMarkers(input.clientHtml);

  if (serverMarkers.length !== clientMarkers.length) {
    return {
      safe: false,
      reason: `marker count mismatch: server=${serverMarkers.length} client=${clientMarkers.length}`,
      mismatchedAttributes: [],
    };
  }

  const mismatched: string[] = [];
  for (let i = 0; i < serverMarkers.length; i += 1) {
    const server = serverMarkers[i];
    const client = clientMarkers[i];
    if (server === undefined || client === undefined) continue;
    if (server !== client) {
      mismatched.push(`index ${i}: server="${server}" client="${client}"`);
    }
  }

  if (mismatched.length > 0) {
    return {
      safe: false,
      reason: `${mismatched.length} marker(s) differ between server and client HTML`,
      mismatchedAttributes: mismatched,
    };
  }

  return {
    safe: true,
    reason: `all ${serverMarkers.length} marker(s) match between server and client`,
    mismatchedAttributes: [],
  };
};

/**
 * A marker is deterministic if the same inputs always produce the same output.
 * This is a structural guarantee of the source-id algorithm (SHA-256 hash),
 * not a runtime check. This function validates that two independent transforms
 * of the same source produce identical markers — the empirical proof of the
 * invariant.
 */
export const isMarkerDeterministic = (
  firstRender: readonly string[],
  secondRender: readonly string[],
): boolean => {
  if (firstRender.length !== secondRender.length) return false;
  for (let i = 0; i < firstRender.length; i += 1) {
    const a = firstRender[i];
    const b = secondRender[i];
    if (a === undefined || b === undefined) return false;
    if (a !== b) return false;
  }
  return true;
};
