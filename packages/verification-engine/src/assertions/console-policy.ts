/**
 * Console policy assertion.
 *
 * Asserts no console errors or warnings were emitted during the verification
 * window. A source patch that introduces a runtime error (broken import,
 * undefined reference, React key warning) fails this assertion even if the
 * visual assertions pass.
 */

import type { ConsoleEntry } from "../dom-adapter.js";
import type { AssertionResult } from "../types.js";

/** Console levels that count as policy violations. */
const VIOLATION_LEVELS: ReadonlySet<ConsoleEntry["level"]> = new Set(["error", "warn"]);

/**
 * Assert the console entries contain no errors or warnings.
 *
 * @param entries Console entries captured during the verification window.
 */
export function assertConsoleClean(entries: readonly ConsoleEntry[]): AssertionResult {
  const violations = entries.filter((e) => VIOLATION_LEVELS.has(e.level));
  const passed = violations.length === 0;
  const details = violations
    .slice(0, 5)
    .map((v) => `[${v.level}] ${v.message}`)
    .join("; ");
  return {
    name: "console-clean",
    passed,
    expected: "no errors or warnings",
    actual: violations.length === 0 ? "clean" : `${violations.length} violation(s): ${details}`,
    message: passed
      ? "Console is clean (no errors or warnings)."
      : `Console policy violation: ${violations.length} error/warning entry(ies) detected.`,
  };
}
