/**
 * Svelte source adapter (VC-V1V2-19).
 *
 * Maps a runtime Svelte element (carrying an opaque `data-vc-source` marker) to
 * its source location using the marker registry. Uses `marker` evidence (HIGH
 * confidence per Task 4's never-wrong-HIGH policy — `marker` is a solo-strong
 * method).
 *
 * The adapter is constructed via {@link createSvelteAdapter} with an injected
 * registry lookup and optional route metadata. The exported
 * {@link SVELTE_ADAPTER} singleton has no data loaded and returns no candidates.
 */

import type { SourceEntry } from "@vision-control/source-registry";

import type {
  AdapterContextLike,
  SourceAdapterLike,
  SourceCandidate,
  SvelteRouteSegmentInfo,
} from "./types.js";

export interface SvelteAdapterData {
  /** Marker -> source-location lookup. */
  readonly lookup?: (sourceId: string) => SourceEntry | undefined;
  /** Route segments detected during dev transform (SvelteKit). */
  readonly routeSegments?: readonly SvelteRouteSegmentInfo[];
  /** Runtime instance count threshold for repeated-instance ambiguity. */
  readonly repeatedInstanceThreshold?: number;
}

const MARKER_EVIDENCE = ["marker"] as const;

const findRouteSegment = (
  segments: readonly SvelteRouteSegmentInfo[],
  workspaceRelativePath: string,
): SvelteRouteSegmentInfo | undefined => {
  for (const segment of segments) {
    if (segment.workspaceRelativePath === workspaceRelativePath) return segment;
  }
  return undefined;
};

/**
 * Factory: create a Svelte source adapter with injected marker-lookup and
 * route metadata.
 */
export const createSvelteAdapter = (data: SvelteAdapterData = {}): SourceAdapterLike => ({
  id: "svelte",
  description:
    "Svelte dev-only source marker resolution (opaque data-vc-source -> source location via registry)",
  resolve: (context: AdapterContextLike): readonly SourceCandidate[] => {
    if (data.lookup === undefined) return [];

    const identity = context.identity;
    if (identity === undefined) return [];
    const sourceId = identity.sourceId;
    if (sourceId === undefined) return [];

    const entry = data.lookup(sourceId);
    if (entry === undefined) return [];

    const warnings: string[] = [];
    const ownershipRisk: SourceCandidate["ownershipRisk"] = "none";

    if (data.routeSegments !== undefined) {
      const routeSegment = findRouteSegment(data.routeSegments, entry.workspaceRelativePath);
      if (routeSegment !== undefined) {
        warnings.push(`route segment: ${routeSegment.segment} (${routeSegment.fileName})`);
      }
    }

    const instanceCount = context.runtimeInstanceCount ?? 1;
    const threshold = data.repeatedInstanceThreshold ?? 1;
    if (instanceCount > threshold) {
      warnings.push(`repeated instance ambiguity: ${instanceCount} elements share this source id`);
      return [
        {
          sourceId: entry.sourceId,
          workspaceRelativePath: entry.workspaceRelativePath,
          startLine: entry.range.startLine,
          startColumn: entry.range.startColumn,
          endLine: entry.range.endLine,
          endColumn: entry.range.endColumn,
          componentName: entry.componentName,
          ...(entry.staticClassName !== undefined
            ? { staticClassName: entry.staticClassName }
            : {}),
          confidence: "medium",
          warnings,
          evidence: [...MARKER_EVIDENCE],
          ownershipRisk,
        },
      ];
    }

    return [
      {
        sourceId: entry.sourceId,
        workspaceRelativePath: entry.workspaceRelativePath,
        startLine: entry.range.startLine,
        startColumn: entry.range.startColumn,
        endLine: entry.range.endLine,
        endColumn: entry.range.endColumn,
        componentName: entry.componentName,
        ...(entry.staticClassName !== undefined ? { staticClassName: entry.staticClassName } : {}),
        confidence: "high",
        warnings,
        evidence: [...MARKER_EVIDENCE],
        ownershipRisk,
      },
    ];
  },
});

/**
 * Default singleton adapter — no marker-lookup or route data loaded.
 * Returns no candidates (defers to the resolver's marker cascade when bare).
 */
export const SVELTE_ADAPTER: SourceAdapterLike = createSvelteAdapter();
