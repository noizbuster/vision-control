/**
 * Text content assertion.
 *
 * For `text-edit` operations: verifies the element's text content matches the
 * expected value after the source patch landed. Compares trimmed content so
 * insignificant whitespace does not cause a false negative.
 */

import type { AssertionResult, ResolvedTarget } from "../types.js";

/**
 * Assert the target's trimmed text content equals `expected`.
 *
 * @param trim Normalize whitespace before comparison (default true).
 */
export function assertText(
  target: ResolvedTarget,
  expected: string,
  options?: { readonly trim?: boolean },
): AssertionResult {
  const trim = options?.trim ?? true;
  const raw = target.dom.getText(target.element);
  const actual = trim ? raw.trim() : raw;
  const expectedNorm = trim ? expected.trim() : expected;
  const passed = actual === expectedNorm;
  return {
    name: "text",
    passed,
    expected: expectedNorm,
    actual,
    message: passed
      ? "Text content matches expected value."
      : `Text mismatch: expected ${JSON.stringify(expectedNorm)} but got ${JSON.stringify(actual)}.`,
  };
}
