/**
 * Focus-order accessibility suggestions (ADR-017 / PRD lines 1992-1993).
 *
 * Detects when the tab (focus) order diverges from the DOM order. The DOM order
 * is the default screen-reader reading order; when positive `tabindex` values
 * force a different focus sequence, keyboard and AT users traverse the page
 * differently than the visual/DOM order — a confusing and often inaccessible
 * experience. Advisory only.
 *
 * The recommendation (per WCAG 2.4.3) is to remove positive tabindex values and
 * rely on DOM order. A positive tabindex is the primary signal here; a
 * `tabindex="-1"` removes the element from the tab sequence (not a desync, but
 * worth surfacing on interactive elements).
 */

import type { AccessibilitySuggestion } from "./suggested-fixes.js";
import { buildAttributePresentAssertion } from "./suggested-fixes.js";

/**
 * One tabbable element in DOM order, with its resolved `tabindex`.
 */
export interface FocusOrderElement {
  /** Element identity in DOM order (source id, runtime id, or selector). */
  readonly id: string;
  readonly tagName: string;
  /** Resolved tabindex: undefined (no attribute), "-1", "0", or a positive int. */
  readonly tabindex?: string;
  /** True when the element is interactive (has semantics needing focus). */
  readonly isInteractive?: boolean;
}

export type FocusOrderInput = readonly FocusOrderElement[];

/** Parse a tabindex string into a number, or undefined when absent/non-numeric. */
export const parseTabindex = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Detect focus-order divergence. A divergence is present when at least one
 * element carries a positive `tabindex` that, sorted numerically, reorders the
 * sequence away from DOM order. Also flags an interactive element with
 * `tabindex="-1"` (removed from the tab sequence) as an info-level advisory.
 */
export const detectFocusOrderIssues = (
  elements: FocusOrderInput,
): readonly AccessibilitySuggestion[] => {
  const out: AccessibilitySuggestion[] = [];
  if (elements.length < 2) return out;

  const domOrder = elements.map((e) => e.id);
  const positive = elements.filter((e) => {
    const n = parseTabindex(e.tabindex);
    return n !== undefined && n > 0;
  });

  if (positive.length > 0) {
    // Sort by positive tabindex (stable on DOM index for ties) and compare.
    const sorted = [...elements]
      .map((e, domIndex) => ({ id: e.id, n: parseTabindex(e.tabindex) ?? 0, domIndex }))
      .sort((a, b) => (a.n !== b.n ? a.n - b.n : a.domIndex - b.domIndex))
      .map((e) => e.id);
    const diverged = sorted.some((id, i) => id !== domOrder[i]);
    if (diverged) {
      out.push({
        code: "focus-order-diverges-from-dom",
        level: "warn",
        message:
          "Positive tabindex values force a focus order that differs from DOM order; keyboard users tab through elements in a different sequence than the reading order.",
        remediation:
          "Remove positive tabindex values and rely on DOM order for the tab sequence. If a custom order is required, reorder the elements in the source DOM instead.",
        verificationAssertion: buildAttributePresentAssertion("tabindex", "0"),
      });
    }
  }

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el) continue;
    const n = parseTabindex(el.tabindex);
    if (n === -1 && el.isInteractive) {
      out.push({
        code: "interactive-element-removed-from-tab-sequence",
        level: "info",
        message: `Interactive <${el.tagName.toLowerCase()}> has tabindex="-1" which removes it from the keyboard tab sequence. Confirm this is intentional.`,
        remediation:
          'If the element should be keyboard-reachable, remove tabindex="-1" or set tabindex="0".',
        verificationAssertion: buildAttributePresentAssertion("tabindex", "0"),
      });
    }
  }

  return out;
};
