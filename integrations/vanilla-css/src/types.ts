/**
 * Local contract-type mirrors for the vanilla CSS adapter (PRD §15.3 / Task 45).
 *
 * These structurally mirror @vision-control/source-resolver's SourceCandidate,
 * SourceAdapter, AdapterContext, and confidence types. Defined locally to
 * avoid a cyclic package dependency: source-resolver re-exports
 * VANILLA_CSS_ADAPTER from this package (source-resolver → vanilla-css edge),
 * so this package MUST NOT import from source-resolver at the package level
 * (vanilla-css → source-resolver would create a build-cycle — D15 drift
 * detector, see packages/source-resolver/src/tokens/cross-source-integration.test.ts).
 *
 * TypeScript structural typing guarantees the adapter returned here satisfies
 * source-resolver's SourceAdapter interface when consumed. The resolver spreads
 * candidates through `enforceNeverWrongHigh` (a rest-spread), so the
 * vanilla-css-specific metadata fields below survive intact into the resolver
 * output for any consumer that reads them.
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

/** 0-based line/column source range. */
export interface VanillaCssSourceRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

/**
 * Structural candidate shape. Mirrors SourceCandidate in source-resolver (the
 * Zod-inferred type of SourceCandidateSchema) PLUS the PRD §15.3 vanilla-css
 * metadata. The base fields are kept identical so the candidate is structurally
 * assignable to source-resolver's SourceCandidate; the metadata fields are
 * additive and flow through the resolver's spread transforms.
 */
export interface SourceCandidate {
  // --- base fields (structural mirror of source-resolver SourceCandidate) ---
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

  // --- PRD §15.3 vanilla-css-specific metadata (additive) ---
  /** The selector that matched, e.g. ".btn". */
  readonly matchedSelector?: string;
  /** Cascade layer name when the rule is inside @layer, e.g. "components". */
  readonly cascadeLayer?: string;
  /** Media query text when the rule is inside @media, e.g. "(min-width: 600px)". */
  readonly mediaQuery?: string;
  /** Specificity tuple as "(a,b,c)", e.g. "(0,1,0)". */
  readonly specificity?: string;
  /** Origin of a CSS custom property referenced by this rule's declarations. */
  readonly customPropertyOrigin?: CustomPropertyOrigin;
}

/** Origin of a CSS custom property (--var) declaration. */
export interface CustomPropertyOrigin {
  readonly name: string;
  readonly value: string;
  readonly stylesheetUrl: string;
  readonly range: VanillaCssSourceRange;
  readonly cascadeLayer?: string;
}

/**
 * Context handed to the adapter. `identity` is opaque here (the vanilla CSS
 * adapter only consumes `cssClasses` and `runtimeInstanceCount`); using
 * `unknown` keeps the contract assignable from source-resolver's AdapterContext
 * (whose `identity` is a concrete SelectionIdentity).
 */
export interface AdapterContextLike {
  readonly identity?: unknown;
  readonly cssClasses?: readonly string[];
  readonly runtimeInstanceCount?: number;
}

export interface SourceAdapterLike {
  readonly id: string;
  readonly description?: string;
  resolve(context: AdapterContextLike): readonly SourceCandidate[];
}
