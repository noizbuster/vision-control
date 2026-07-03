/**
 * Vue source adapter (VC-V1V2-19).
 *
 * Maps a runtime Vue element (carrying an opaque `data-vc-source` marker) to its
 * source location using the marker registry. Uses `marker` evidence (HIGH
 * confidence per Task 4's never-wrong-HIGH policy — `marker` is a solo-strong
 * method).
 *
 * The adapter is constructed via {@link createVueAdapter} with an injected
 * registry lookup and optional SFC-block/route metadata. The exported
 * {@link VUE_ADAPTER} singleton has no data loaded and returns no candidates
 * (it defers to the built-in marker cascade in the resolver when used bare).
 *
 * **Confidence policy** (never-wrong-HIGH):
 * - Marker resolves + single instance -> **HIGH** (evidence: ["marker"]).
 * - Marker resolves but repeated instances -> **MEDIUM** + warning (instance
 *   ambiguity).
 * - No marker / no registry -> returns no candidates (defers to other cascades).
 */

import type { SourceEntry } from "@vision-control/source-registry";

import type {
  AdapterContextLike,
  SourceAdapterLike,
  SourceCandidate,
  VueRouteSegmentInfo,
  VueSfcBlock,
} from "./types.js";

export interface VueAdapterData {
  /** Marker -> source-location lookup. */
  readonly lookup?: (sourceId: string) => SourceEntry | undefined;
  /** SFC blocks detected during dev transform. */
  readonly blocks?: readonly VueSfcBlock[];
  /** Route segments detected during dev transform. */
  readonly routeSegments?: readonly VueRouteSegmentInfo[];
  /** Runtime instance count threshold for repeated-instance ambiguity. */
  readonly repeatedInstanceThreshold?: number;
}

const MARKER_EVIDENCE = ["marker"] as const;

const findRouteSegment = (
  segments: readonly VueRouteSegmentInfo[],
  workspaceRelativePath: string,
): VueRouteSegmentInfo | undefined => {
  for (const segment of segments) {
    if (segment.workspaceRelativePath === workspaceRelativePath) return segment;
  }
  return undefined;
};

/**
 * Factory: create a Vue source adapter with injected marker-lookup and
 * block/route metadata. Callers that have loaded the dev-transform metadata
 * should use this instead of the bare {@link VUE_ADAPTER} singleton.
 */
export const createVueAdapter = (data: VueAdapterData = {}): SourceAdapterLike => ({
  id: "vue",
  description:
    "Vue dev-only source marker resolution (opaque data-vc-source -> source location via registry + SFC metadata)",
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
 * Default singleton adapter — no marker-lookup or block/route data loaded.
 *
 * Returns no candidates (defers to the resolver's built-in marker cascade when
 * used bare). Callers with dev-transform metadata should use
 * {@link createVueAdapter}.
 */
export const VUE_ADAPTER: SourceAdapterLike = createVueAdapter();
