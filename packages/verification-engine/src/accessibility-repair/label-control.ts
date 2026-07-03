/**
 * Label/control association accessibility suggestions (ADR-017 / PRD line 1991).
 *
 * Detects form controls (`<input>`, `<select>`, `<textarea>`) that have no
 * associated `<label>`. Association is via: a wrapping `<label>`, a matching
 * `for`/`id` pair, `aria-label`, or `aria-labelledby`. A control with none of
 * these has no accessible name and is announced without context by screen
 * readers. Advisory only.
 */

import type { AccessibilitySuggestion } from "./suggested-fixes.js";
import { buildAttributePresentAssertion } from "./suggested-fixes.js";

/**
 * A projected form control. `associatedLabel` is true when the browser adapter
 * confirms an association (wrapping label, or a `<label for>` whose target id
 * matches this control's `id`).
 */
export interface LabelControlElement {
  readonly tagName: string;
  readonly id?: string;
  readonly name?: string;
  readonly type?: string;
  readonly ariaLabel?: string;
  readonly ariaLabelledby?: string;
  /** True when the adapter resolved a wrapping or for/id label association. */
  readonly associatedLabel?: boolean;
}

export type LabelControlInput = readonly LabelControlElement[];

/** Tags that are labelable form controls. */
export const LABELABLE_TAGS: ReadonlySet<string> = new Set(["input", "select", "textarea"]);

/** True when a control has any accessible-name source beyond a label. */
export const hasAccessibleNameSource = (el: LabelControlElement): boolean => {
  if (el.associatedLabel === true) return true;
  const ariaLabel = el.ariaLabel?.trim();
  if (ariaLabel && ariaLabel.length > 0) return true;
  if (el.ariaLabelledby && el.ariaLabelledby.trim().length > 0) return true;
  return false;
};

/**
 * Detect labelable controls with no associated label and no alternative name
 * source. Each suggestion's verification assertion confirms an `aria-label` (or
 * the association mechanism) landed after a fix.
 */
export const detectLabelControlIssues = (
  controls: LabelControlInput,
): readonly AccessibilitySuggestion[] => {
  const out: AccessibilitySuggestion[] = [];
  for (let i = 0; i < controls.length; i++) {
    const el = controls[i];
    if (!el) continue;
    const tag = el.tagName.toLowerCase();
    if (!LABELABLE_TAGS.has(tag)) continue;
    if (hasAccessibleNameSource(el)) continue;

    // Hidden inputs do not need labels.
    if (tag === "input" && el.type === "hidden") continue;

    const descriptor =
      el.name !== undefined && el.name !== ""
        ? `name=${JSON.stringify(el.name)}`
        : el.id !== undefined && el.id !== ""
          ? `id=${JSON.stringify(el.id)}`
          : "(anonymous)";
    out.push({
      code: "missing-label-control-association",
      level: "warn",
      message: `Form control <${tag}> ${descriptor} has no associated <label>, aria-label, or aria-labelledby. Screen readers announce it without a name.`,
      remediation: `Associate a <label for="..."> matching the control's id, wrap the control in a <label>, or add an aria-label.`,
      verificationAssertion: buildAttributePresentAssertion("aria-label"),
    });
  }
  return out;
};
