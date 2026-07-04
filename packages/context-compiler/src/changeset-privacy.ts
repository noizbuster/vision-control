/**
 * ChangeSet-level privacy report (PRD §12.2 / Appendix D.6).
 *
 * The ChangeSet carries a {@link PrivacyReport} field that records what the
 * redaction engine would mask before this set's context is exported. This
 * module computes that report by composing the two redaction layers:
 *
 * 1. SELECTOR redaction (PRD §27.2) over the projected target — masks values
 *    by element SHAPE (password input, `[data-private]`, hidden field). Runs
 *    only when an inspector selection is supplied; without one, the ChangeSet
 *    has no element-attribute surface to match selectors against.
 * 2. STRING-PATTERN redaction (ADR-009) over the ChangeSet's own data — the
 *    page URL and the operation values — masking secrets by CONTENT (JWTs, API
 *    keys, high-entropy tokens typed into an edit).
 *
 * The two layers never double-count: the selector pass masks credential values
 * to `[REDACTED:<id>]` before the string pass sees them, and the string pass
 * skips values already carrying the marker. Each entry carries a `source`
 * discriminator so a reader can tell which layer fired.
 */

import type { ChangeSet, PrivacyRedaction, PrivacyReport } from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { createPrivacyReport, redactObject } from "@vision-control/security";

import { type RedactionConfig, redactTarget, resolveSelectorRules } from "./redaction-selectors.js";
import { projectSelectionToTarget } from "./target-projection.js";

export interface ComputeChangesetPrivacyReportOptions {
  /** Inspector selection carrying the element attributes for selector matching. */
  readonly selection?: SelectionSummary;
  /** DOM/selector redaction config (PRD §27.2), sourced from `vision-control.config.ts`. */
  readonly redactionConfig?: RedactionConfig;
}

export const computeChangesetPrivacyReport = (
  changeset: ChangeSet,
  options: ComputeChangesetPrivacyReportOptions = {},
): PrivacyReport => {
  const rules = resolveSelectorRules(options.redactionConfig);
  const selectorResult =
    options.selection === undefined
      ? undefined
      : redactTarget(projectSelectionToTarget(options.selection), rules);
  const selectorRedactions: PrivacyRedaction[] = (selectorResult?.redactions ?? []).map((r) => ({
    field: r.field,
    patternId: r.patternId,
    description: r.description,
    source: r.source,
  }));

  const surface = {
    page: changeset.page,
    ...(selectorResult?.target !== undefined ? { target: selectorResult.target } : {}),
    operations: changeset.operations,
  };
  const redactedSurface = redactObject(surface);
  const stringRedactions: PrivacyRedaction[] = createPrivacyReport(
    surface,
    redactedSurface,
  ).redactions.map((entry) => ({
    field: entry.field,
    patternId: entry.patternId,
    description: entry.description,
    source: "string-pattern" as const,
  }));

  return {
    redactions: [...selectorRedactions, ...stringRedactions],
    totalRedacted: selectorRedactions.length + stringRedactions.length,
  };
};
