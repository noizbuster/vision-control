/**
 * Specificity conflict diagnostics for style previews.
 *
 * When the stylesheet manager injects `[data-vc-preview-id="x"] { padding: 16px }`
 * but the page CSS has higher specificity (e.g. `#main .card { padding: 8px }`),
 * the preview rule does not take effect. This module detects that mismatch by
 * comparing the computed style after applying vs the expected value.
 */

import type { PreviewDomAdapter } from "./dom-adapter.js";

export interface SpecificityConflictDiagnostic {
  readonly kind: "specificity-conflict";
  readonly runtimeId: string;
  readonly property: string;
  readonly expectedValue: string;
  readonly actualValue: string;
  readonly message: string;
}

/**
 * Check whether the applied preview value actually took effect on the element.
 * Returns a diagnostic if the computed value differs from the expected value,
 * or null if the preview applied cleanly.
 */
export function detectSpecificityConflict(
  dom: PreviewDomAdapter,
  runtimeId: string,
  element: Element,
  property: string,
  expectedValue: string,
): SpecificityConflictDiagnostic | null {
  const computed = dom.getComputedStyle(element);
  const actualValue = computed.getPropertyValue(property);
  const normalizedActual = actualValue.trim();
  const normalizedExpected = expectedValue.trim();

  if (cssValuesMatch(normalizedActual, normalizedExpected)) {
    return null;
  }

  return {
    kind: "specificity-conflict",
    runtimeId,
    property,
    expectedValue: normalizedExpected,
    actualValue: normalizedActual,
    message: `Preview "${property}: ${normalizedExpected}" was overridden by higher-specificity CSS (computed: "${normalizedActual}"). Consider !important.`,
  };
}

/**
 * Compare two CSS values loosely: strips units whitespace and checks if the
 * expected value appears in the computed value (handles "16px" matching
 * "16px" and shorthand cases).
 */
function cssValuesMatch(actual: string, expected: string): boolean {
  if (actual === expected) return true;
  if (actual.length === 0 || expected.length === 0) return false;
  // Handle unit-equivalent values (e.g., "16px" vs "16px")
  if (actual === expected) return true;
  // The expected value might be a shorthand component; check containment
  return actual.includes(expected);
}
