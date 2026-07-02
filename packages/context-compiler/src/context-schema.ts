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

/** Version of the compiled-context format. Bumped on a breaking shape change. */
export const CONTEXT_FORMAT_VERSION = "1.0.0";

/** The eight MVP operation kinds, mirrored from change-ir (kept in sync by the
 * compiler's exhaustive switch — adding a kind to change-ir without a branch
 * here is a compile error). */
export const OPERATION_SUMMARY_KINDS = [
  "style-edit",
  "class-add",
  "class-remove",
  "class-replace",
  "text-edit",
  "reorder-child",
  "reparent-element",
  "resize-element",
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
 * Verification plan stub. Task 26 (verification engine) replaces this with the
 * real assertions generated from the change set. For now the context carries an
 * empty assertion list and a note so the agent knows verification is pending.
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

/** Redaction entry, mirroring `@vision-control/security#PrivacyReportRedaction`. */
export const PrivacyReportRedactionSchema = z.object({
  field: z.string(),
  patternId: z.string(),
  description: z.string(),
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
 * The full compiled agent context. Field order follows the priority order used
 * by the token budget (goal first, privacy report last). Lower-priority fields
 * are truncated first when the context exceeds the token budget.
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
});
export type CompiledContext = z.infer<typeof CompiledContextSchema>;

/** Default MCP token budget for a compiled context (PRD 14.6). */
export const DEFAULT_TOKEN_BUDGET = 8000;

/** Default verification-plan stub used until task 26 lands. */
export const STUB_VERIFICATION_PLAN: VerificationPlanSummary = {
  assertions: [],
  notes: "Verification plan will be generated by the verification engine",
};
