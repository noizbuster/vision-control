import { z } from "zod";

/**
 * Privacy report carried by a ChangeSet (PRD §12.2 / Appendix D.6).
 *
 * Records which fields were redacted before context export and why. This is the
 * IR-level shape persisted on the set; the context-compiler owns the engine that
 * computes it (`computeChangesetPrivacyReport`), composing Task 35's DOM
 * selector redaction with the security package's string-pattern redaction.
 * Sensitive DOM/network data must never reach the default context export
 * (Appendix D.6).
 *
 * Each {@link PrivacyRedaction} carries a `source` discriminator so a reader
 * can tell whether a redaction came from a DOM selector rule (Task 35, e.g.
 * `password-input`, `data-private`) or a string-pattern rule (e.g. `jwt`,
 * `sensitive-key`, `high-entropy`). The selector rule ids that fired are the
 * subset of `redactions` where `source === "selector"` (the PRD §27.2
 * "selectors applied" surface).
 */
export const PrivacyRedactionSourceSchema = z.enum(["selector", "string-pattern"]);
export type PrivacyRedactionSource = z.infer<typeof PrivacyRedactionSourceSchema>;

export const PrivacyRedactionSchema = z.object({
  field: z.string(),
  patternId: z.string(),
  description: z.string(),
  /** Which redaction layer produced this entry (PRD §27.2 selector vs ADR-009 string-pattern). */
  source: PrivacyRedactionSourceSchema,
});
export type PrivacyRedaction = z.infer<typeof PrivacyRedactionSchema>;

export const PrivacyReportSchema = z.object({
  redactions: z.array(PrivacyRedactionSchema),
  totalRedacted: z.number().int().nonnegative(),
  /** Optional provenance note (e.g. "migrated v1 — recompute via redaction engine"). */
  note: z.string().optional(),
});
export type PrivacyReport = z.infer<typeof PrivacyReportSchema>;

/**
 * Empty privacy report. The not-yet-computed baseline stamped by
 * {@link createChangeSet}; replaced by a real computed report via
 * {@link withPrivacyReport} once the redaction engine runs.
 */
export const DEFAULT_PRIVACY_REPORT: PrivacyReport = {
  redactions: [],
  totalRedacted: 0,
};
