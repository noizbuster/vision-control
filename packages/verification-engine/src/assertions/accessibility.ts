/**
 * Accessibility assertions: ARIA role and accessible name.
 *
 * Verifies the element's accessibility tree role and name match the expected
 * values. These are stable across renders and useful for re-identification and
 * for confirming semantic changes landed in the source.
 */

import type { AssertionResult, ResolvedTarget } from "../types.js";

/**
 * Assert the target's ARIA role equals `expectedRole`.
 *
 * Reads the explicit `role` attribute first, falling back to the implicit role
 * via the adapter.
 */
export function assertRole(target: ResolvedTarget, expectedRole: string): AssertionResult {
  const explicit = target.dom.getAttribute(target.element, "role");
  const actual = explicit ?? implicitRole(target);
  const passed = actual === expectedRole;
  return {
    name: "role",
    passed,
    expected: expectedRole,
    actual,
    message: passed
      ? "Accessibility role matches expected value."
      : `Role mismatch: expected ${JSON.stringify(expectedRole)} but got ${JSON.stringify(actual)}.`,
  };
}

/**
 * Assert the target's accessible name equals `expectedName`.
 *
 * Reads the `aria-label` or `aria-labelledby` attribute, falling back to text
 * content.
 */
export function assertName(target: ResolvedTarget, expectedName: string): AssertionResult {
  const ariaLabel = target.dom.getAttribute(target.element, "aria-label");
  const actual = ariaLabel ?? target.dom.getText(target.element).trim();
  const passed = actual === expectedName;
  return {
    name: "name",
    passed,
    expected: expectedName,
    actual,
    message: passed
      ? "Accessible name matches expected value."
      : `Name mismatch: expected ${JSON.stringify(expectedName)} but got ${JSON.stringify(actual)}.`,
  };
}

/** Derive an implicit ARIA role from the tag (minimal MVP subset). */
function implicitRole(target: ResolvedTarget): string {
  const tag = target.element.tagName.toLowerCase();
  const roleMap: Readonly<Record<string, string>> = {
    a: "link",
    button: "button",
    img: "img",
    input: "textbox",
    nav: "navigation",
    ul: "list",
    ol: "list",
    li: "listitem",
    h1: "heading",
    h2: "heading",
    h3: "heading",
  };
  return roleMap[tag] ?? "";
}
