/**
 * Redaction chokepoint for the compiled context.
 *
 * Every compiled context MUST pass through {@link redactContext} before it is
 * rendered to JSON or Markdown and handed to a coding agent. The function
 * deep-redacts the whole document via `@vision-control/security#redactObject`
 * (cookies, auth headers, passwords, hidden form values, secrets — all masked),
 * then builds a {@link PrivacyReport} by diffing the original against the
 * redacted copy, and stamps the report onto the returned context.
 *
 * This is the single place where "no secret leaks into agent context" is
 * enforced (PRD Appendix D.6). Renderers trust their input is already redacted.
 */

import {
  createPrivacyReport,
  redactObject,
  type PrivacyReport as SecurityPrivacyReport,
} from "@vision-control/security";

import type { CompiledContext, PrivacyReport } from "./context-schema.js";

/**
 * Return a deep-redacted copy of `context` with an updated privacy report. The
 * input is never mutated. The returned `privacyReport` reflects every leaf that
 * changed during redaction; it never carries the original secret values.
 */
export const redactContext = (context: CompiledContext): CompiledContext => {
  const redacted = redactObject(context) as CompiledContext;
  const report = createPrivacyReport(context, redacted);
  return { ...redacted, privacyReport: toContextReport(report) };
};

/** Adapt the security report shape to the context-schema privacy report. */
const toContextReport = (report: SecurityPrivacyReport): PrivacyReport => ({
  redactions: report.redactions.map((entry) => ({
    field: entry.field,
    patternId: entry.patternId,
    description: entry.description,
  })),
  totalRedacted: report.totalRedacted,
});
