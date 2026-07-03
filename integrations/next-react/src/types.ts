/**
 * Local contract-type mirrors (VC-V1V2-13).
 *
 * These structurally mirror @vision-control/source-resolver's SourceCandidate,
 * SourceAdapter, AdapterContext, and confidence types. Defined locally to
 * avoid a circular package dependency: source-resolver re-exports
 * NEXT_ADAPTER from this package (source-resolver -> next-react edge), so this
 * package MUST NOT import from source-resolver at the package level
 * (next-react -> source-resolver would create a build-cycle — see learnings
 * D15 from VC-V1V2-11/12).
 *
 * TypeScript structural typing guarantees the adapter returned here satisfies
 * source-resolver's SourceAdapter interface when consumed. The shapes are kept
 * identical to the Zod-inferred types in source-candidate.ts / confidence.ts.
 *
 * This package DOES depend on @vision-control/vite-react (shared marker
 * primitives) and @vision-control/source-registry (registry types). Neither
 * creates a cycle: source-resolver -> next-react -> {vite-react, source-registry}.
 */

export type Confidence = "high" | "medium" | "low";

export type ConfidenceEvidence =
  | "marker"
  | "fingerprint"
  | "manifest"
  | "source-map"
  | "ast-origin"
  | "text-search"
  | "llm-inference";

export type OwnershipRisk = "none" | "low" | "medium" | "high";

export interface SourceCandidate {
  readonly sourceId?: string;
  readonly workspaceRelativePath?: string;
  readonly startLine?: number;
  readonly startColumn?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly componentName?: string;
  readonly snippet?: string;
  readonly staticClassName?: string;
  readonly cssFilePath?: string;
  readonly cssLine?: number;
  readonly confidence: Confidence;
  readonly warnings: string[];
  readonly evidence?: ConfidenceEvidence[];
  readonly ownershipRisk?: OwnershipRisk;
  readonly selected?: boolean;
  readonly alternativeCount?: number;
}

export interface AdapterContextLike {
  readonly cssClasses?: readonly string[];
  readonly runtimeInstanceCount?: number;
  readonly identity?: {
    readonly sourceId?: string;
    readonly fingerprint?: string;
  };
}

export interface SourceAdapterLike {
  readonly id: string;
  readonly description?: string;
  resolve(context: AdapterContextLike): readonly SourceCandidate[];
}

/**
 * A Next.js server/client boundary detected in source.
 *
 * Next.js app-router files begin with `"use client"` or `"use server"` to mark
 * the server/client boundary. The marker plugin records these so the adapter
 * knows where a component's source origin crosses the boundary.
 */
export interface ServerClientBoundary {
  readonly workspaceRelativePath: string;
  readonly directive: "use client" | "use server";
  readonly line: number;
  readonly column: number;
}

/**
 * Route-segment metadata for a Next.js page/layout file.
 *
 * For app router: `app/blog/page.tsx` -> segment `blog/page`, router `app`.
 * For pages router: `pages/about.tsx` -> segment `about`, router `pages`.
 */
export interface RouteSegmentInfo {
  readonly workspaceRelativePath: string;
  readonly segment: string;
  readonly routerType: "app" | "pages";
  readonly fileName: string;
}
