/**
 * Zod schemas and inferred types for the compiled agent context.
 *
 * The {@link CompiledContext} is the JSON-safe, redactable document handed to a
 * coding agent via the MCP server or the daemon export endpoints. It is
 * assembled by priority (see `token-budget.ts`) and every field is designed to
 * survive `redactObject` from `@vision-control/security` without leaking
 * secrets (PRD 14.6 / Appendix D.6).
 *
 * Nothing here references a live DOM `Element` or an absolute filesystem path.
 * The selected-target summary is a JSON-safe projection of the inspector's
 * `SelectionSummary` (the live `Element` reference carried by breadcrumb items
 * is dropped during compilation).
 */

import { z } from "zod";

/** Version of the compiled-context format. Bumped minor on additive V1 fields. */
export const CONTEXT_FORMAT_VERSION = "1.1.0";

/** Every operation kind, mirrored from change-ir (kept in sync by the
 * compiler's exhaustive switch — adding a kind to change-ir without a branch
 * here is a compile error). */
export const OPERATION_SUMMARY_KINDS = [
  "style-edit",
  "remove-style",
  "class-add",
  "class-remove",
  "class-replace",
  "set-attribute",
  "text-edit",
  "reorder-child",
  "reparent-element",
  "position-element",
  "resize-element",
  "multi-select-group",
  "group-reorder",
  "group-reparent",
  "align-elements",
  "distribute-elements",
  "set-container-layout",
  "set-child-sizing",
  "grid-reorder",
  "grid-span",
  "insert-element",
  "remove-element",
  "duplicate-element",
  "wrap-elements",
  "unwrap-element",
  "breakpoint-style-edit",
  "breakpoint-class-edit",
  "breakpoint-text-edit",
  "screenshot-crop-ref",
  "suggested-diff",
  "set-component-prop",
] as const;

export const OperationSummaryKindSchema = z.enum(OPERATION_SUMMARY_KINDS);
export type OperationSummaryKind = z.infer<typeof OperationSummaryKindSchema>;

/** Confidence that the selection maps back to source (mirrors source-resolver). */
export const SourceConfidenceLevelSchema = z.enum(["high", "medium", "low"]);
export type SourceConfidenceLevel = z.infer<typeof SourceConfidenceLevelSchema>;

/** Identity of the selected element — JSON-safe, no live DOM reference. */
export const TargetIdentitySchema = z.object({
  runtimeId: z.string().optional(),
  sourceId: z.string().optional(),
  fingerprint: z.string().optional(),
  confidence: SourceConfidenceLevelSchema.optional(),
  selectors: z.array(z.string()),
});
export type TargetIdentity = z.infer<typeof TargetIdentitySchema>;

/** One ancestry step; the live `Element` reference is deliberately absent. */
export const BreadcrumbSummarySchema = z.object({
  tagName: z.string(),
  id: z.string().optional(),
  className: z.string().optional(),
  role: z.string().optional(),
  selector: z.string().optional(),
});
export type BreadcrumbSummary = z.infer<typeof BreadcrumbSummarySchema>;

/** Accessible semantic description of the selected element. */
export const SemanticSummarySchema = z.object({
  tagName: z.string(),
  role: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  textContentPreview: z.string(),
});
export type SemanticSummary = z.infer<typeof SemanticSummarySchema>;

/** A parsed class on the selected element. */
export const ClassEntrySchema = z.object({
  name: z.string(),
  source: z.string(),
});
export type ClassEntry = z.infer<typeof ClassEntrySchema>;

/** A safe attribute exposed in the target summary. */
export const AttributeEntrySchema = z.object({
  name: z.string(),
  value: z.string(),
});
export type AttributeEntry = z.infer<typeof AttributeEntrySchema>;

/** CSS box-model subset used for layout reasoning. */
export const BoxModelSummarySchema = z.object({
  contentWidth: z.number(),
  contentHeight: z.number(),
  positionX: z.number(),
  positionY: z.number(),
});
export type BoxModelSummary = z.infer<typeof BoxModelSummarySchema>;

/** JSON-safe projection of the inspector's full `SelectionSummary`. */
export const TargetSummarySchema = z.object({
  identity: TargetIdentitySchema,
  semantic: SemanticSummarySchema,
  breadcrumb: z.array(BreadcrumbSummarySchema),
  computedStyle: z.record(z.string(), z.string()),
  boxModel: BoxModelSummarySchema,
  classList: z.array(ClassEntrySchema),
  attributes: z.array(AttributeEntrySchema),
});
export type TargetSummary = z.infer<typeof TargetSummarySchema>;

/** A single operation reduced to its agent-facing essentials. */
export const OperationSummarySchema = z.object({
  id: z.string(),
  kind: OperationSummaryKindSchema,
  /** Anti-cheat flag: `true` is a runtime preview mutation, never source intent. */
  runtime: z.boolean(),
  /** Human-readable one-liner, e.g. "Set color to red". */
  description: z.string(),
  /** Selector or source id of the element the operation targets. */
  target: z.string().optional(),
  /** Kind-specific payload, kept lossy on purpose (full detail lives in the IR). */
  detail: z.record(z.string(), z.string()),
});
export type OperationSummary = z.infer<typeof OperationSummarySchema>;

/** One source candidate with its snippet. All paths workspace-relative. */
export const SourceCandidateSummarySchema = z.object({
  workspaceRelativePath: z.string().optional(),
  componentName: z.string().optional(),
  snippet: z.string().optional(),
  startLine: z.number().int().nonnegative().optional(),
  endLine: z.number().int().nonnegative().optional(),
  confidence: SourceConfidenceLevelSchema,
  warnings: z.array(z.string()),
  staticClassName: z.string().optional(),
  cssFilePath: z.string().optional(),
});
export type SourceCandidateSummary = z.infer<typeof SourceCandidateSummarySchema>;

export const SourceSummarySchema = z.object({
  candidates: z.array(SourceCandidateSummarySchema),
  /**
   * Index into {@link SourceSummarySchema.candidates} of the highest-confidence
   * candidate. Stored as an index (not a nested object) so no candidate object
   * is referenced twice — `redactObject` treats shared references as circular.
   */
  bestCandidateIndex: z.number().int().nonnegative().optional(),
});
export type SourceSummary = z.infer<typeof SourceSummarySchema>;

/** Parent and sibling layout context for layout-aware editing. */
export const LayoutSummarySchema = z.object({
  parentMode: z.string(),
  parentDisplay: z.string(),
  parentFlexDirection: z.string().optional(),
  siblingCount: z.number().int().min(0),
  siblingIndex: z.number().int().min(0),
});
export type LayoutSummary = z.infer<typeof LayoutSummarySchema>;

/**
 * Verification plan summary carried by the compiled context. The compiler
 * projects the verification engine's per-operation `createPlan` assertions into
 * JSON-safe `{ description }` records (the engine's `run` closures are not
 * serializable; the runner re-derives them at verification time). The notes
 * field carries the preview-clear-before-verify invariant (PRD Appendix D.1).
 */
export const VerificationAssertionSchema = z
  .object({
    description: z.string(),
  })
  .passthrough();

export const VerificationPlanSummarySchema = z.object({
  assertions: z.array(VerificationAssertionSchema),
  notes: z.string(),
});
export type VerificationPlanSummary = z.infer<typeof VerificationPlanSummarySchema>;

export const WarningSeveritySchema = z.enum(["info", "warning", "error"]);
export type WarningSeverity = z.infer<typeof WarningSeveritySchema>;

/** A warning collected from any source (stale registry, low confidence, ...). */
export const WarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: WarningSeveritySchema,
  /** Origin of the warning, e.g. "source-resolver" or "inspector". */
  source: z.string().optional(),
});
export type Warning = z.infer<typeof WarningSchema>;

/**
 * Redaction entry, mirroring `@vision-control/security#PrivacyReportRedaction`
 * plus a `source` discriminator (PRD §27.2 selector vs ADR-009 string-pattern)
 * so a reader can tell which redaction layer fired.
 */
export const PrivacyRedactionSourceSchema = z.enum(["selector", "string-pattern"]);
export type PrivacyRedactionSource = z.infer<typeof PrivacyRedactionSourceSchema>;

export const PrivacyReportRedactionSchema = z.object({
  field: z.string(),
  patternId: z.string(),
  description: z.string(),
  source: PrivacyRedactionSourceSchema,
});
export type PrivacyReportRedaction = z.infer<typeof PrivacyReportRedactionSchema>;

export const PrivacyReportSchema = z.object({
  redactions: z.array(PrivacyReportRedactionSchema),
  totalRedacted: z.number().int().nonnegative(),
});
export type PrivacyReport = z.infer<typeof PrivacyReportSchema>;

/** Compilation provenance and budget accounting. */
export const ContextMetadataSchema = z.object({
  compiledAt: z.number().int().nonnegative(),
  formatVersion: z.string(),
  tokenBudget: z.number().int().positive(),
  tokenEstimate: z.number().int().nonnegative(),
  truncated: z.boolean(),
  /** Section names reduced to fit the budget, lowest-priority first. */
  truncatedSections: z.array(z.string()),
  operationCount: z.number().int().nonnegative(),
});
export type ContextMetadata = z.infer<typeof ContextMetadataSchema>;

/**
 * V1: the multi-selection group currently in scope (absent for single-element
 * edits). Carries the JSON-safe identity of every selected target plus the
 * stable group id.
 */
export const MultiSelectSummarySchema = z.object({
  groupId: z.string(),
  targets: z.array(TargetIdentitySchema),
});
export type MultiSelectSummary = z.infer<typeof MultiSelectSummarySchema>;

/**
 * V1: the active responsive breakpoint context. `activeViewport` is the current
 * viewport label; `mediaQuerySource` is the originating media query when known;
 * `responsivePrefix` is the framework prefix (e.g. Tailwind `md`) when known;
 * `scopedChangeCount` is how many breakpoint-scoped operations target this
 * breakpoint (derived from the changeset by the compiler).
 */
export const BreakpointContextSchema = z.object({
  activeViewport: z.string(),
  mediaQuerySource: z.string().optional(),
  responsivePrefix: z.string().optional(),
  scopedChangeCount: z.number().int().nonnegative().optional(),
});
export type BreakpointContext = z.infer<typeof BreakpointContextSchema>;

/** V1: detail behind a source-confidence level (method + reasons + warnings). */
export const SourceConfidenceDetailSchema = z.object({
  method: z.string(),
  reasons: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SourceConfidenceDetail = z.infer<typeof SourceConfidenceDetailSchema>;

/**
 * V1 (opt-in only): a metadata reference to an opt-in screenshot crop artifact.
 * NEVER carries image bytes — only the artifact id and redaction report ref.
 * Absent unless the session explicitly opted into screenshot capture.
 */
export const ScreenshotRedactionSummarySchema = z.object({
  /** How many sensitive regions were masked before capture. */
  totalMasked: z.number().int().nonnegative(),
  /** Post-capture re-check verdict (ADR-011: must be "pass" to persist). */
  postCaptureRecheck: z.enum(["pass", "fail"]),
});
export type ScreenshotRedactionSummary = z.infer<typeof ScreenshotRedactionSummarySchema>;

export const ScreenshotRefSummarySchema = z.object({
  artifactId: z.string(),
  redactionReport: z.string().optional(),
  redactionSummary: ScreenshotRedactionSummarySchema.optional(),
});
export type ScreenshotRefSummary = z.infer<typeof ScreenshotRefSummarySchema>;

/**
 * V1 (inert): one deterministic patch suggestion, surfaced as candidate data.
 * Never applied by the runtime or MCP (ADR-012); a coding agent may consume it.
 *
 * `diff`/`confidence`/`preconditions` are the Task-3 baseline. `kind` and
 * `sourceRanges` (VC-V1V2-14) carry the suggestion kind and the exact source
 * ranges the diff touches, so a consumer can locate the edit without re-parsing
 * the diff. All V1V2-14 fields are OPTIONAL so a 1.1.0 baseline summary built
 * by Task-3's round-trip still validates.
 */
export const SuggestedDiffSummarySchema = z.object({
  diff: z.string(),
  confidence: SourceConfidenceLevelSchema,
  preconditions: z.array(z.string()),
  kind: z
    .enum([
      "tailwind-token-replace",
      "css-declaration-replace",
      "css-class-replace",
      "css-modules-local-edit",
      "inline-style-object-edit",
      "jsx-text-edit",
      "simple-reorder",
    ])
    .optional(),
  sourceRanges: z
    .array(
      z.object({
        startLine: z.number().int().positive(),
        startColumn: z.number().int().nonnegative(),
        endLine: z.number().int().positive(),
        endColumn: z.number().int().nonnegative(),
      }),
    )
    .optional(),
});
export type SuggestedDiffSummary = z.infer<typeof SuggestedDiffSummarySchema>;

/** V1: grid / auto-layout context for layout-aware reasoning. */
export const LayoutContextSummarySchema = z.object({
  gridColumns: z.number().int().nonnegative().optional(),
  gridRows: z.number().int().nonnegative().optional(),
  autoLayout: z.string().optional(),
});
export type LayoutContextSummary = z.infer<typeof LayoutContextSummarySchema>;

/**
 * V1 (VC-V1V2-18): compact summary of the design-token registry. Tells an agent
 * which token categories and source kinds are in play, and how many names have
 * conflicting values across sources. The full token list is NOT emitted (it can
 * be large); this summary plus the conflict warnings give the agent enough to
 * reason about token provenance without blowing the token budget.
 *
 * Structurally compatible with `TokenRegistrySummary` from
 * `@vision-control/source-resolver`; defined locally (same decoupling pattern
 * as `SourceCandidateSummarySchema`).
 */
export const TokenRegistrySummarySchema = z.object({
  totalTokens: z.number().int().nonnegative(),
  categories: z.record(z.string(), z.number().int().nonnegative()),
  sources: z.array(z.string()),
  conflictCount: z.number().int().nonnegative(),
});
export type TokenRegistrySummary = z.infer<typeof TokenRegistrySummarySchema>;

/**
 * V1 (VC-V1V2-21): one discovered component prop surfaced in the agent context.
 * `editable` is true only for safe static literals; dynamic/computed props carry
 * `editable: false` so the agent knows a deterministic edit is not possible.
 */
export const ComponentPropSummarySchema = z.object({
  name: z.string(),
  kind: z.string(),
  editable: z.boolean(),
  value: z.string().optional(),
  candidates: z.array(z.string()).optional(),
});
export type ComponentPropSummary = z.infer<typeof ComponentPropSummarySchema>;

/**
 * V1 (VC-V1V2-21): summary of the selected component's props for agent context.
 * Includes the component name, framework, discovered props, ownership risk, and
 * any prop-flow warnings (reparented/moved, cross-boundary).
 */
export const ComponentPropsSummarySchema = z.object({
  componentName: z.string(),
  framework: z.string(),
  props: z.array(ComponentPropSummarySchema),
  ownershipRisk: z.enum(["none", "low", "medium", "high"]),
  warnings: z.array(z.string()),
});
export type ComponentPropsSummary = z.infer<typeof ComponentPropsSummarySchema>;

/**
 * The full compiled agent context. Field order follows the priority order used
 * by the token budget (goal first, privacy report last). Lower-priority fields
 * are truncated first when the context exceeds the token budget.
 *
 * V1 (format 1.1.0) adds the optional trailing fields (`multiSelect`,
 * `breakpoint`, `sourceConfidenceDetail`, `screenshotRef`, `suggestedDiffs`,
 * `layoutContext`, `adapterWarnings`). All are optional so a 1.0.0 consumer
 * that ignores unknown keys still parses a 1.1.0 context.
 */
export const CompiledContextSchema = z.object({
  goal: z.string(),
  target: TargetSummarySchema,
  operations: z.array(OperationSummarySchema),
  source: SourceSummarySchema,
  layout: LayoutSummarySchema,
  verificationPlan: VerificationPlanSummarySchema,
  warnings: z.array(WarningSchema),
  privacyReport: PrivacyReportSchema,
  metadata: ContextMetadataSchema,
  multiSelect: MultiSelectSummarySchema.optional(),
  breakpoint: BreakpointContextSchema.optional(),
  sourceConfidenceDetail: SourceConfidenceDetailSchema.optional(),
  screenshotRef: ScreenshotRefSummarySchema.optional(),
  suggestedDiffs: z.array(SuggestedDiffSummarySchema).optional(),
  layoutContext: LayoutContextSummarySchema.optional(),
  adapterWarnings: z.array(WarningSchema).optional(),
  tokenRegistry: TokenRegistrySummarySchema.optional(),
  componentProps: ComponentPropsSummarySchema.optional(),
});
export type CompiledContext = z.infer<typeof CompiledContextSchema>;

/** Default MCP token budget for a compiled context (PRD 14.6). */
export const DEFAULT_TOKEN_BUDGET = 8000;
