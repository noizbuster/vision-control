/**
 * Computed style assertion.
 *
 * For `style-edit` and `resize-element` operations: verifies the element's
 * resolved computed style matches the expected property/value pairs after the
 * source patch landed. Reads through `getComputedStyle` so cascaded and
 * inherited values are resolved.
 */

import type { AssertionResult, ResolvedTarget } from "../types.js";

/** One expected CSS property and its target value (normalized). */
export interface ExpectedStyle {
  readonly property: string;
  readonly value: string;
}

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Assert the target's computed style matches the expected entries.
 *
 * Property values are normalized (trimmed, lowercased, whitespace-collapsed)
 * before comparison so `16PX` and `16px` match.
 */
export function assertComputedStyle(
  target: ResolvedTarget,
  expected: readonly ExpectedStyle[],
): AssertionResult {
  const failures: string[] = [];
  const actuals: string[] = [];
  for (const entry of expected) {
    const raw = target.dom.getStyle(target.element, entry.property);
    const actual = normalize(raw);
    actuals.push(`${entry.property}: ${actual}`);
    if (actual !== normalize(entry.value)) {
      failures.push(
        `${entry.property} expected ${JSON.stringify(normalize(entry.value))} got ${JSON.stringify(actual)}`,
      );
    }
  }
  const passed = failures.length === 0;
  const expectedStr = expected.map((e) => `${e.property}: ${normalize(e.value)}`).join("; ");
  return {
    name: "computed-style",
    passed,
    expected: expectedStr,
    actual: actuals.join("; "),
    message: passed
      ? "Computed style matches expected values."
      : `Style mismatch: ${failures.join("; ")}.`,
  };
}
