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

import {
  BreakpointContextSchema,
  ComponentPropsSummarySchema,
  MultiSelectSummarySchema,
  ScreenshotRefSummarySchema,
  SourceConfidenceDetailSchema,
  SuggestedDiffSummarySchema,
  TokenRegistrySummarySchema,
} from "./context-extended-schema.js";
import { OperationSummarySchema } from "./operation-summary-schema.js";
import {
  LayoutContextSummarySchema,
  LayoutSummarySchema,
  SourceConfidenceLevelSchema,
  TargetSummarySchema,
} from "./target-context-schema.js";

export * from "./context-extended-schema.js";
export * from "./operation-summary-schema.js";
export * from "./target-context-schema.js";

export const CONTEXT_FORMAT_VERSIONS = ["1.0.0", "1.1.0", "1.2.0"] as const;
export const CONTEXT_FORMAT_VERSION = "1.2.0" as const;

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
  formatVersion: z.enum(CONTEXT_FORMAT_VERSIONS),
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
