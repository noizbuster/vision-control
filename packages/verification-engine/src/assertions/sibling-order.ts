/**
 * Sibling order assertion.
 *
 * For `reorder-child` operations: verifies the target element occupies the
 * expected position among its siblings after the source patch landed. Uses a
 * 0-based index among element siblings (text nodes excluded).
 */

import type { AssertionResult, ResolvedTarget } from "../types.js";

/**
 * Assert the target is at `expectedIndex` (0-based) among its element siblings.
 */
export function assertSiblingOrder(target: ResolvedTarget, expectedIndex: number): AssertionResult {
  const actual = target.dom.getSiblingIndex(target.element);
  const passed = actual === expectedIndex;
  return {
    name: "sibling-order",
    passed,
    expected: String(expectedIndex),
    actual: String(actual),
    message: passed
      ? "Element is at the expected sibling index."
      : `Order mismatch: expected index ${expectedIndex} but element is at index ${actual}.`,
  };
}
