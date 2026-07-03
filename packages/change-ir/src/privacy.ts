import { z } from "zod";

/**
 * Privacy report carried by a ChangeSet (PRD §12.2 / Appendix D.6).
 *
 * Records which fields were redacted before context export and why. This is the
 * IR-level shape persisted on the set; the security package owns the redaction
 * engine that populates it. Sensitive DOM/network data must never reach the
 * default context export (Appendix D.6).
 */
export const PrivacyRedactionSchema = z.object({
  field: z.string(),
  patternId: z.string(),
  description: z.string(),
});
export type PrivacyRedaction = z.infer<typeof PrivacyRedactionSchema>;

export const PrivacyReportSchema = z.object({
  redactions: z.array(PrivacyRedactionSchema),
  totalRedacted: z.number().int().nonnegative(),
  /** Optional provenance note (e.g. "migrated v1 — recompute via redaction engine"). */
  note: z.string().optional(),
});
export type PrivacyReport = z.infer<typeof PrivacyReportSchema>;

/** Empty privacy report used until the redaction engine computes one. */
export const DEFAULT_PRIVACY_REPORT: PrivacyReport = {
  redactions: [],
  totalRedacted: 0,
};
