/**
 * Parent relationship assertion.
 *
 * For `reparent-element` operations: verifies the target element now lives
 * under the expected parent, identified by a stable selector.
 */

import type { AssertionResult, ResolvedTarget } from "../types.js";

/**
 * Assert the target's parent element matches `expectedParentSelector`.
 *
 * The parent is matched via `dom.matchesSelector` so CSS selector specificity is
 * respected (e.g. `#container`, `.list-group`, `[data-testid="sidebar"]`).
 */
export function assertParent(
  target: ResolvedTarget,
  expectedParentSelector: string,
): AssertionResult {
  const parent = target.dom.getParent(target.element);
  if (parent === null) {
    return {
      name: "parent",
      passed: false,
      expected: expectedParentSelector,
      actual: "(no parent — orphaned element)",
      message: "Element has no parent; expected a parent matching the selector.",
    };
  }
  const matches = target.dom.matchesSelector(parent, expectedParentSelector);
  const actualSelector = describeElement(parent);
  return {
    name: "parent",
    passed: matches,
    expected: expectedParentSelector,
    actual: actualSelector,
    message: matches
      ? "Parent element matches expected selector."
      : `Parent mismatch: expected parent matching ${JSON.stringify(expectedParentSelector)} but got ${actualSelector}.`,
  };
}

/** Build a short descriptor for an element for the report. */
function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.getAttribute("id");
  if (id !== null) return `#${id}`;
  const source = element.getAttribute("data-vc-source");
  if (source !== null) return `${tag}[data-vc-source="${source}"]`;
  return tag;
}
