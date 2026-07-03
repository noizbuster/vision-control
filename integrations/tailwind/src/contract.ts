/**
 * Local structural mirror of the source-resolver adapter contract (VC-V1V2-11).
 *
 * This package deliberately does NOT depend on `@vision-control/source-resolver`
 * at build time. Doing so would create a cyclic workspace dependency:
 * `source-resolver` re-exports {@link TAILWIND_TOKEN_ADAPTER} from this package
 * (its `v1-stubs.ts`), so `source-resolver -> tailwind`. If this package also
 * depended on `source-resolver`, nx could not schedule either build. Instead we
 * mirror the contract types here; TypeScript structural typing makes the
 * adapter assignable to `source-resolver`'s `SourceAdapter` because the shapes
 * are identical. The two type definitions are kept in sync by the contract
 * tests in both packages.
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

/**
 * Structural candidate shape. Mirrors `SourceCandidate` in source-resolver
 * (itself the Zod-inferred type of `SourceCandidateSchema`). Every field is
 * optional except `confidence` and `warnings`, matching the schema.
 */
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

/**
 * Context handed to the adapter. `identity` is opaque here (the Tailwind
 * adapter only consumes `cssClasses` and `runtimeInstanceCount`); using
 * `unknown` keeps the contract assignable from source-resolver's
 * `AdapterContext` (whose `identity` is a concrete `SelectionIdentity`).
 */
export interface AdapterContext {
  readonly identity: unknown;
  readonly cssClasses?: readonly string[];
  readonly runtimeInstanceCount?: number;
}

export interface SourceAdapter {
  readonly id: string;
  readonly description?: string;
  resolve(context: AdapterContext): readonly SourceCandidate[];
}

/** Construct a candidate with empty-warning default (mirrors createSourceCandidate). */
export const candidate = (
  input: Omit<SourceCandidate, "warnings"> & {
    readonly warnings?: readonly string[];
  },
): SourceCandidate => ({
  ...input,
  warnings: input.warnings === undefined ? [] : [...input.warnings],
});
