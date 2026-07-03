/**
 * Local contract-type mirrors (VC-V1V2-19 / D15).
 *
 * These structurally mirror @vision-control/source-resolver's SourceCandidate,
 * SourceAdapter, AdapterContext, and confidence types. Defined locally to
 * avoid a circular package dependency: source-resolver re-exports SVELTE_ADAPTER
 * from this package (source-resolver -> svelte edge), so this package MUST NOT
 * import from source-resolver at the package level (svelte -> source-resolver
 * would create a build-cycle — see learnings D15 from VC-V1V2-11/12/13).
 *
 * TypeScript structural typing guarantees the adapter returned here satisfies
 * source-resolver's SourceAdapter interface when consumed. The shapes are kept
 * identical to the Zod-inferred types in source-candidate.ts / confidence.ts.
 *
 * This package DOES depend on @vision-control/vite-react (shared marker
 * primitives) and @vision-control/source-registry (registry types). Neither
 * creates a cycle: source-resolver -> svelte -> {vite-react, source-registry}.
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
 * A Svelte route segment (for SvelteKit pages).
 *
 * For a component at `src/routes/about/+page.svelte` -> segment `about`; for
 * `src/routes/blog/[slug]/+page.svelte` -> segment `blog/[slug]`.
 */
export interface SvelteRouteSegmentInfo {
  readonly workspaceRelativePath: string;
  readonly segment: string;
  readonly fileName: string;
}
