/**
 * Local contract-type mirrors (VC-V1V2-19 / D15).
 *
 * These structurally mirror @vision-control/source-resolver's SourceCandidate,
 * SourceAdapter, AdapterContext, and confidence types. Defined locally to
 * avoid a circular package dependency: source-resolver re-exports VUE_ADAPTER
 * from this package (source-resolver -> vue edge), so this package MUST NOT
 * import from source-resolver at the package level (vue -> source-resolver
 * would create a build-cycle — see learnings D15 from VC-V1V2-11/12/13).
 *
 * TypeScript structural typing guarantees the adapter returned here satisfies
 * source-resolver's SourceAdapter interface when consumed. The shapes are kept
 * identical to the Zod-inferred types in source-candidate.ts / confidence.ts.
 *
 * This package DOES depend on @vision-control/vite-react (shared marker
 * primitives) and @vision-control/source-registry (registry types). Neither
 * creates a cycle: source-resolver -> vue -> {vite-react, source-registry}.
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
 * A Vue SFC boundary detected in source.
 *
 * Records the `<template>` / `<script setup>` / `<script>` block offsets so the
 * adapter knows which block an element originates from.
 */
export interface VueSfcBlock {
  readonly type: "template" | "script-setup" | "script" | "style";
  readonly workspaceRelativePath: string;
  readonly startLine: number;
  readonly lang: string | undefined;
}

/**
 * Vue route segment metadata (for vue-router pages).
 *
 * For a component at `src/views/Home.vue` -> segment `Home`; for
 * `src/pages/blog/[slug].vue` -> segment `blog/[slug]`.
 */
export interface VueRouteSegmentInfo {
  readonly workspaceRelativePath: string;
  readonly segment: string;
  readonly fileName: string;
}
