/**
 * Accessibility checks for alignment / distribution and visual reordering
 * (PRD section 29 / VC-0619).
 *
 * A visual edit that reorders children via CSS `order` (or any mechanism that
 * diverges visual order from DOM order) creates a reading-order desync: screen
 * readers traverse the DOM order, but sighted users see the visual order. This
 * module surfaces that risk as a non-blocking WARNING and provides a verification
 * ASSERTION that an applied alignment fix did not break reading order.
 *
 * The warning NEVER blocks — it surfaces to the user/agent so the decision to
 * accept the desync (and add a corrective DOM reorder) is explicit.
 */

import type { AssertionResult } from "./types.js";

/**
 * Severity of an accessibility warning. `warn` is a real risk a human should
 * review; `info` is advisory. Neither blocks the operation.
 */
export type AlignmentAccessibilityLevel = "warn" | "info";

/**
 * A non-blocking accessibility warning surfaced alongside an alignment /
 * distribution or visual-reorder intent. The consumer decides whether to show
 * it in the inspector, include it in the agent context, or attach a corrective
 * follow-up operation.
 */
export interface AlignmentAccessibilityWarning {
  /** Stable machine code, e.g. `dom-visual-order-desync`. */
  readonly code: string;
  readonly level: AlignmentAccessibilityLevel;
  readonly message: string;
  /** Suggested corrective action the user/agent can take. */
  readonly remediation: string;
}

/**
 * Detect DOM-vs-visual-order desync from CSS `order` values.
 *
 * CSS `order` reorders flex/grid items visually WITHOUT moving them in the DOM.
 * When the visual order (sorted by `order`) differs from the DOM order, screen
 * readers — which follow the DOM — read the items in a different sequence than
 * sighted users perceive. This is the accessibility risk PRD §2003 warns about.
 *
 * @param orderValues The computed CSS `order` of each sibling, in DOM order.
 *   All-zero (or all-equal) means no reordering (DOM order == visual order).
 * @returns A `warn`-level warning when the values produce a visual reorder,
 *   otherwise `null`.
 */
export const detectCssOrderUsage = (
  orderValues: readonly number[],
): AlignmentAccessibilityWarning | null => {
  if (orderValues.length < 2) return null;

  const allEqual = orderValues.every((v) => v === orderValues[0]);
  if (allEqual) return null;

  // Determine whether sorting by order changes the sequence.
  const domIndices = orderValues.map((_, i) => i);
  const visualIndices = [...domIndices].sort((a, b) => {
    const diff = (orderValues[a] ?? 0) - (orderValues[b] ?? 0);
    return diff !== 0 ? diff : a - b;
  });
  const reordered = visualIndices.some((v, i) => v !== domIndices[i]);
  if (!reordered) return null;

  return {
    code: "dom-visual-order-desync",
    level: "warn",
    message:
      "CSS `order` reorders items visually without changing DOM order; screen readers follow DOM order, so reading order diverges from visual order.",
    remediation:
      "Reorder the elements in the source DOM to match the intended visual order, or accept the desync and document it for assistive-tech users.",
  };
};

/**
 * Detect a generic DOM-vs-visual-order desync from parallel identity arrays.
 *
 * Useful when an alignment/reorder operation records the DOM order and the
 * visual order separately (e.g. a grid-area reorder or an `align-content`
 * change that shifts the visual sequence). Emits the same warning code as
 * {@link detectCssOrderUsage} so consumers have a single desync signal.
 *
 * @param domOrder Element identities (source ids or runtime ids) in DOM order.
 * @param visualOrder The same identities in their visual order after the edit.
 */
export const detectDomVisualOrderDesync = (
  domOrder: readonly string[],
  visualOrder: readonly string[],
): AlignmentAccessibilityWarning | null => {
  if (domOrder.length < 2 || domOrder.length !== visualOrder.length) return null;
  const desync = visualOrder.some((id, i) => id !== domOrder[i]);
  if (!desync) return null;

  return {
    code: "dom-visual-order-desync",
    level: "warn",
    message:
      "Visual order diverges from DOM order after the edit; assistive technology will read elements in a different sequence than they appear visually.",
    remediation: "Apply the reorder in the source DOM so reading order matches the visual layout.",
  };
};

/**
 * Assert that an applied alignment fix preserves reading order.
 *
 * This is the verification gate (PRD §2399 VC-1104 parent/order assertion,
 * scoped to alignment): after an alignment/distribution operation lands as
 * source, the DOM order and the visual order must agree. A divergence means
 * the alignment introduced a CSS-`order`-style visual reorder that breaks the
 * reading sequence for assistive-tech users.
 *
 * @param domOrder Element identities in DOM order (post-HMR, post-source-patch).
 * @param visualOrder The same identities in their visual order.
 * @returns An {@link AssertionResult} that passes when the orders agree.
 */
export const assertReadingOrderPreserved = (
  domOrder: readonly string[],
  visualOrder: readonly string[],
): AssertionResult => {
  const expected = domOrder.join(" -> ");
  const actual = visualOrder.join(" -> ");
  const sameLength = domOrder.length === visualOrder.length;
  const passed =
    sameLength && domOrder.length > 0 && domOrder.every((id, i) => id === visualOrder[i]);
  return {
    name: "reading-order-preserved",
    passed,
    expected,
    actual,
    message: passed
      ? "Reading order matches visual order after the alignment change."
      : "Reading order diverges from visual order: the alignment introduced a DOM-vs-visual desync that affects assistive technology.",
  };
};

/**
 * Convenience wrapper: surface CSS `order` as an advisory `info` warning when it
 * is present but does NOT yet cause a desync (all-equal non-zero values). Keeps
 * agents informed that `order` is in use even when currently harmless.
 */
export const detectCssOrderPresent = (
  orderValues: readonly number[],
): AlignmentAccessibilityWarning | null => {
  if (orderValues.length === 0) return null;
  const anyNonZero = orderValues.some((v) => v !== 0);
  if (!anyNonZero) return null;
  const desync = detectCssOrderUsage(orderValues);
  if (desync) return desync;
  return {
    code: "css-order-present",
    level: "info",
    message:
      "CSS `order` is set on one or more siblings; DOM order currently matches visual order.",
    remediation: "No action required, but keep DOM order in sync if `order` values change.",
  };
};
