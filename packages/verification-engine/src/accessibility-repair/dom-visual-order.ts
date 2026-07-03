/**
 * DOM-vs-visual-order accessibility suggestions (ADR-017 / PRD lines 1992, 2003).
 *
 * Visual reordering via CSS `order` (or any mechanism that diverges visual order
 * from DOM order) creates a reading-order desync: screen readers follow the DOM,
 * sighted users follow the visual layout. This detector composes the existing
 * alignment-accessibility detection logic and projects it into ADVISORY
 * suggestions, each with a deterministic verification assertion.
 *
 * The single-target assertion confirms the divergent CSS `order` was removed
 * (resolved `order` is back to the default `0`). The full reading-order check
 * across the whole sibling sequence is the exported standalone
 * {@link assertReadingOrderPreserved} (re-exported here for caller convenience).
 */

import {
  assertReadingOrderPreserved,
  detectCssOrderUsage,
  detectDomVisualOrderDesync,
} from "../alignment-accessibility.js";
import type { AssertionEntry, AssertionResult, ResolvedTarget } from "../types.js";
import type { AccessibilitySuggestion } from "./suggested-fixes.js";

/**
 * Input for DOM-vs-visual-order analysis. Provide `cssOrder` for a CSS-`order`
 * scan, or `domOrder`/`visualOrder` for a generic desync scan, or both.
 */
export interface DomVisualOrderInput {
  /** CSS `order` values of siblings in DOM order. Drives the CSS-order scan. */
  readonly cssOrder?: readonly number[];
  /** Element identities in DOM order. Pair with `visualOrder`. */
  readonly domOrder?: readonly string[];
  /** Element identities in visual order. Pair with `domOrder`. */
  readonly visualOrder?: readonly string[];
}

/**
 * Build a single-target assertion confirming the element's resolved CSS `order`
 * is back to the default `0` (the most common fix for a CSS-order desync). The
 * full sequence check is the standalone {@link assertReadingOrderPreserved}.
 */
const buildCssOrderRemovedAssertion = (): AssertionEntry => ({
  name: "css-order-removed",
  run: (target: ResolvedTarget): AssertionResult => {
    const raw = target.dom.getStyle(target.element, "order");
    const actual = raw?.trim() || "0";
    const passed = actual === "0";
    return {
      name: "css-order-removed",
      passed,
      expected: "0",
      actual,
      message: passed
        ? "Resolved CSS order is the default (0); the visual reorder was removed."
        : `Resolved CSS order is ${JSON.stringify(actual)}; the visual reorder is still in effect and reading order still diverges from DOM order.`,
    };
  },
});

/**
 * Detect DOM-vs-visual-order desync from CSS `order` values and/or parallel
 * DOM/visual identity arrays. Returns advisory suggestions with verification
 * assertions. Reuses the alignment-accessibility detectors so the desync logic
 * has a single definition.
 */
export const detectDomVisualOrderIssues = (
  input: DomVisualOrderInput,
): readonly AccessibilitySuggestion[] => {
  const out: AccessibilitySuggestion[] = [];

  const cssWarning = input.cssOrder !== undefined ? detectCssOrderUsage(input.cssOrder) : null;
  if (cssWarning) {
    out.push({
      code: cssWarning.code,
      level: "warn",
      message: cssWarning.message,
      remediation: cssWarning.remediation,
      verificationAssertion: buildCssOrderRemovedAssertion(),
    });
  }

  if (input.domOrder !== undefined && input.visualOrder !== undefined) {
    const desync = detectDomVisualOrderDesync(input.domOrder, input.visualOrder);
    if (desync) {
      out.push({
        code: desync.code,
        level: "warn",
        message: desync.message,
        remediation: desync.remediation,
        verificationAssertion: buildCssOrderRemovedAssertion(),
      });
    }
  }

  return out;
};

// Re-export the standalone multi-element reading-order assertion so callers that
// hold the full sibling sequence can verify a DOM reorder end-to-end. This is
// the multi-target complement to the single-target suggestion assertion.
export { assertReadingOrderPreserved };
