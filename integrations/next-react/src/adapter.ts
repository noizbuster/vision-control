/**
 * Next.js source adapter (VC-V1V2-13).
 *
 * Maps a runtime Next.js element (carrying an opaque `data-vc-source` marker)
 * to its source location using the marker registry + server/client boundary
 * metadata. Uses `marker` evidence (HIGH confidence per Task 4's
 * never-wrong-HIGH policy — `marker` is a solo-strong method).
 *
 * The adapter is constructed via {@link createNextAdapter} with an injected
 * registry and optional boundary/route metadata. The exported
 * {@link NEXT_ADAPTER} singleton has no data loaded and returns no candidates
 * (it defers to the built-in marker cascade in the resolver when used bare).
 *
 * **Confidence policy** (never-wrong-HIGH):
 * - Marker resolves + boundary known + single instance -> **HIGH**
 *   (evidence: ["marker"]).
 * - Marker resolves but crosses a server/client boundary -> **HIGH** with an
 *   ownership-risk warning (the source origin may be in a different module
 *   than the rendering site).
 * - No marker / no registry -> returns no candidates (defers to other
 *   cascades).
 */

import type { SourceEntry } from "@vision-control/source-registry";

import type {
  AdapterContextLike,
  RouteSegmentInfo,
  ServerClientBoundary,
  SourceAdapterLike,
  SourceCandidate,
} from "./types.js";

export interface NextAdapterData {
  /** Marker -> source-location lookup. */
  readonly lookup?: (sourceId: string) => SourceEntry | undefined;
  /** Boundaries detected during dev transform. */
  readonly boundaries?: readonly ServerClientBoundary[];
  /** Route segments detected during dev transform. */
  readonly routeSegments?: readonly RouteSegmentInfo[];
  /** Runtime instance count threshold for repeated-instance ambiguity. */
  readonly repeatedInstanceThreshold?: number;
}

const MARKER_EVIDENCE = ["marker"] as const;

const findBoundary = (
  boundaries: readonly ServerClientBoundary[],
  workspaceRelativePath: string,
): ServerClientBoundary | undefined => {
  for (const boundary of boundaries) {
    if (boundary.workspaceRelativePath === workspaceRelativePath) return boundary;
  }
  return undefined;
};

const findRouteSegment = (
  segments: readonly RouteSegmentInfo[],
  workspaceRelativePath: string,
): RouteSegmentInfo | undefined => {
  for (const segment of segments) {
    if (segment.workspaceRelativePath === workspaceRelativePath) return segment;
  }
  return undefined;
};

/**
 * Factory: create a Next.js source adapter with injected marker-lookup and
 * boundary/route metadata. Callers that have loaded the dev-transform metadata
 * should use this instead of the bare {@link NEXT_ADAPTER} singleton.
 */
export const createNextAdapter = (data: NextAdapterData = {}): SourceAdapterLike => ({
  id: "next",
  description:
    "Next.js dev-only source marker resolution (opaque data-vc-source -> source location via registry + boundary metadata)",
  resolve: (context: AdapterContextLike): readonly SourceCandidate[] => {
    if (data.lookup === undefined) return [];

    const identity = context.identity;
    if (identity === undefined) return [];
    const sourceId = identity.sourceId;
    if (sourceId === undefined) return [];

    const entry = data.lookup(sourceId);
    if (entry === undefined) return [];

    const warnings: string[] = [];
    let ownershipRisk: SourceCandidate["ownershipRisk"] = "none";

    const boundary =
      data.boundaries !== undefined
        ? findBoundary(data.boundaries, entry.workspaceRelativePath)
        : undefined;
    if (boundary !== undefined) {
      warnings.push(
        `element is in a ${boundary.directive} module (${entry.workspaceRelativePath}:${boundary.line}); source origin may differ from the rendering site`,
      );
      ownershipRisk = "low";
    }

    const routeSegment =
      data.routeSegments !== undefined
        ? findRouteSegment(data.routeSegments, entry.workspaceRelativePath)
        : undefined;
    if (routeSegment !== undefined) {
      warnings.push(
        `route segment: ${routeSegment.routerType} router / ${routeSegment.segment} (${routeSegment.fileName})`,
      );
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
 * Default singleton adapter — no marker-lookup or boundary data loaded.
 *
 * Returns no candidates (defers to the resolver's built-in marker cascade when
 * used bare). Callers with dev-transform metadata should use
 * {@link createNextAdapter}.
 */
export const NEXT_ADAPTER: SourceAdapterLike = createNextAdapter();
