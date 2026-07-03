import { z } from "zod";

/**
 * PRD §12.2 ChangeSet context fields. These describe the editing environment a
 * ChangeSet was captured in: which page, which viewport, which elements were
 * selected, how each selected element resolved to source, and the verification
 * + privacy reports attached to the set.
 *
 * Co-located in change-ir (not imported from protocol/source-resolver) to keep
 * the change-ir package dependency-free of other workspace packages, mirroring
 * the `ElementRef` decoupling decision (VC-MVP-06). The shapes are structurally
 * compatible with the richer types those packages carry.
 */

/** The page a ChangeSet was captured against (PRD §12.2). */
export const PageContextSchema = z.object({
  url: z.string(),
  /** Page title; `null` when unknown/unloaded at capture time. */
  title: z.string().nullable(),
});
export type PageContext = z.infer<typeof PageContextSchema>;

/** The viewport dimensions in effect when the ChangeSet was captured. */
export const ViewportContextSchema = z.object({
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
});
export type ViewportContext = z.infer<typeof ViewportContextSchema>;

/**
 * One resolved source mapping for a selected target. Carries the runtime id of
 * the element it resolves, the confidence level, and the resolved source
 * location when known. Structurally compatible with source-resolver's richer
 * `SourceCandidate`; only the fields needed for IR persistence live here.
 */
export const SourceResolutionSchema = z.object({
  elementRuntimeId: z.string().min(1),
  confidence: z.enum(["high", "medium", "low"]),
  workspaceRelativePath: z.string().optional(),
  componentName: z.string().optional(),
  startLine: z.number().int().nonnegative().optional(),
  endLine: z.number().int().nonnegative().optional(),
});
export type SourceResolution = z.infer<typeof SourceResolutionSchema>;

/**
 * One assertion in a verification plan. `description` is the agent-readable
 * summary; the entry is passthrough so the verification engine can attach
 * richer structured data without a schema bump here.
 */
export const VerificationAssertionSchema = z.object({ description: z.string() }).passthrough();
export type VerificationAssertion = z.infer<typeof VerificationAssertionSchema>;

/**
 * Verification plan carried by a ChangeSet (PRD §12.2). A lightweight JSON-safe
 * projection; the live `VerificationPlan` from `@vision-control/verification-engine`
 * (which carries runnable assertion closures) is reduced to this shape before it
 * is persisted on a ChangeSet.
 */
export const VerificationPlanSchema = z.object({
  assertions: z.array(VerificationAssertionSchema),
  notes: z.string(),
});
export type VerificationPlan = z.infer<typeof VerificationPlanSchema>;

/** Sentinel page context for a freshly-created or migrated set. */
export const DEFAULT_PAGE_CONTEXT: PageContext = { url: "<unknown>", title: null };

/** Sentinel viewport for a freshly-created or migrated set. */
export const DEFAULT_VIEWPORT_CONTEXT: ViewportContext = { width: 0, height: 0 };

/** Empty verification plan used until the verification engine generates one. */
export const DEFAULT_VERIFICATION_PLAN: VerificationPlan = {
  assertions: [],
  notes: "verification plan not yet generated — recompile via verification engine",
};
