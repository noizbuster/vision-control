/**
 * Class list assertion.
 *
 * For `class-add`, `class-remove`, `class-replace` operations: verifies the
 * element's class list contains (or excludes) the expected classes after the
 * source patch landed.
 */

import type { AssertionResult, ResolvedTarget } from "../types.js";

/** Expected state of one class after a source patch. */
export interface ExpectedClass {
  readonly name: string;
  readonly present: boolean;
}

/**
 * Assert the target's class list matches the expected entries.
 *
 * Each entry specifies a class name and whether it should be `present` (true)
 * or absent (false). The assertion passes only when ALL entries match.
 */
export function assertClass(
  target: ResolvedTarget,
  expected: readonly ExpectedClass[],
): AssertionResult {
  const classes = new Set(target.dom.getClasses(target.element));
  const failures: string[] = [];
  for (const entry of expected) {
    const has = classes.has(entry.name);
    if (entry.present && !has) {
      failures.push(`missing class "${entry.name}"`);
    } else if (!entry.present && has) {
      failures.push(`unexpected class "${entry.name}"`);
    }
  }
  const passed = failures.length === 0;
  const expectedStr = expected.map((e) => (e.present ? `+${e.name}` : `-${e.name}`)).join(", ");
  const actualStr = [...classes].join(" ") || "(no classes)";
  return {
    name: "class",
    passed,
    expected: expectedStr,
    actual: actualStr,
    message: passed
      ? "Class list matches expected state."
      : `Class mismatch: ${failures.join("; ")}.`,
  };
}
