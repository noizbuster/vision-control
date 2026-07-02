import { z } from "zod";

/**
 * Placeholder privacy report carried by a ChangeSet.
 *
 * Task 24 (security / redaction) replaces this with the real redaction engine
 * that scrubs sensitive DOM and network data before context export. The shape
 * is fixed now: which fields were redacted and why each was redacted. Privacy
 * is a hard constraint — sensitive DOM/network data must never reach the
 * default context (PRD Appendix D.6).
 */
export const PrivacyReportPlaceholderSchema = z.object({
  redactedFields: z.array(z.string()),
  redactionReasons: z.record(z.string(), z.string()),
});

export type PrivacyReportPlaceholder = z.infer<typeof PrivacyReportPlaceholderSchema>;
