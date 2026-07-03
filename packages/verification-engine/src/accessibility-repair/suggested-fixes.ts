/**
 * Accessibility repair suggestions — shared types, assertion builders, and the
 * aggregation entry point (ADR-017 / PRD lines 1987-2003, 2307-2401).
 *
 * ADR-017 fixes the scope: accessibility repair is ADVISORY ONLY. These modules
 * produce suggestion DATA shown to the user and the agent; they never mutate the
 * DOM or the source. Each suggestion carries a deterministic verification
 * assertion (`AssertionEntry`) so a fix can be checked AFTER it is applied
 * through the normal edit pipeline (change IR -> preview -> source patch ->
 * HMR), never through a silent rewrite.
 *
 * A preview that "looks fixed" is not evidence. The assertion runs against the
 * real target after the preview layer is cleared, exactly like every other
 * verification assertion in this package.
 */

import { assertName, assertRole } from "../assertions/accessibility.js";
import type { AssertionEntry, AssertionResult, ResolvedTarget } from "../types.js";

import { type DomVisualOrderInput, detectDomVisualOrderIssues } from "./dom-visual-order.js";
import { detectFocusOrderIssues, type FocusOrderInput } from "./focus-order.js";
import {
  detectKeyboardNavigationIssues,
  type KeyboardNavigationInput,
} from "./keyboard-navigation.js";
import { detectLabelControlIssues, type LabelControlInput } from "./label-control.js";
import { detectRoleNameIssues, type RoleNameInput } from "./role-name.js";

/**
 * Severity of an advisory suggestion. `warn` is a real risk a human should
 * review; `info` is advisory. Neither blocks an operation — there is no
 * `error` level by design (ADR-017: advisory only, never auto-mutation).
 */
export type AccessibilityRepairLevel = "info" | "warn";

/**
 * One advisory accessibility suggestion. The `verificationAssertion` is what
 * makes a fix checkable end-to-end: after the user/agent applies the suggested
 * change through the standard edit path, the assertion is run against the
 * re-resolved target to confirm the fix landed in the source.
 */
export interface AccessibilitySuggestion {
  /** Stable machine code, e.g. `missing-accessible-name`. */
  readonly code: string;
  readonly level: AccessibilityRepairLevel;
  readonly message: string;
  /** Suggested corrective action the user/agent can take. Advisory text only. */
  readonly remediation: string;
  /**
   * Deterministic verification assertion. Run this against the target after the
   * fix is applied (post-HMR, preview cleared) to prove the source changed.
   */
  readonly verificationAssertion: AssertionEntry;
}

/**
 * Build an assertion that checks an attribute is present and non-empty on the
 * resolved target. Used by label-control and keyboard-navigation suggestions
 * (e.g. confirm `aria-label` or `tabindex` landed after a fix).
 */
export const buildAttributePresentAssertion = (
  attributeName: string,
  expectedValue?: string,
): AssertionEntry => ({
  name: `attribute-present:${attributeName}`,
  run: (target: ResolvedTarget): AssertionResult => {
    const actual = target.dom.getAttribute(target.element, attributeName);
    const present = actual !== null && actual !== "";
    const matchesValue = expectedValue === undefined || actual === expectedValue;
    const passed = present && matchesValue;
    return {
      name: `attribute-present:${attributeName}`,
      passed,
      expected: expectedValue ?? "<non-empty>",
      actual: actual ?? "<absent>",
      message: passed
        ? `Attribute ${JSON.stringify(attributeName)} is present on the target.`
        : `Attribute ${JSON.stringify(attributeName)} is ${
            actual === null ? "absent" : "empty"
          } on the target; the accessibility fix did not land in the source.`,
    };
  },
});

/**
 * Build an assertion that confirms the target's accessible name equals an
 * expected value after a fix. Reuses {@link assertName} so the repair assertion
 * and the existing name assertion share one definition of "name".
 */
export const buildAccessibleNameAssertion = (expectedName: string): AssertionEntry => ({
  name: "accessible-name",
  run: (target: ResolvedTarget): AssertionResult => assertName(target, expectedName),
});

/**
 * Build an assertion that confirms the target's ARIA role equals an expected
 * value after a fix. Reuses {@link assertRole}.
 */
export const buildRoleAssertion = (expectedRole: string): AssertionEntry => ({
  name: "role",
  run: (target: ResolvedTarget): AssertionResult => assertRole(target, expectedRole),
});

/**
 * Build an assertion that confirms the target is keyboard-focusable after a
 * fix. Focusability is read as: the element is not `inert`/`disabled`, and has
 * either an implicit focusable tag, a non-negative `tabindex`, or an `href`
 * (links). This mirrors how the keyboard-navigation detector decides.
 */
export const buildFocusableAssertion = (): AssertionEntry => ({
  name: "keyboard-focusable",
  run: (target: ResolvedTarget): AssertionResult => {
    const tag = target.element.tagName.toLowerCase();
    const tabindex = target.dom.getAttribute(target.element, "tabindex");
    const disabled = target.dom.getAttribute(target.element, "disabled");
    const inert = target.dom.getAttribute(target.element, "inert");
    const href = target.dom.getAttribute(target.element, "href");
    const implicitFocusableTags = new Set([
      "a",
      "button",
      "input",
      "select",
      "textarea",
      "summary",
      "details",
    ]);
    const hasValidTabindex = tabindex !== null && tabindex !== "-1";
    const passed =
      inert === null &&
      disabled === null &&
      (implicitFocusableTags.has(tag) || hasValidTabindex || href !== null);
    return {
      name: "keyboard-focusable",
      passed,
      expected: "focusable (implicit tag, non-negative tabindex, or href)",
      actual:
        tabindex !== null
          ? `tabindex=${tabindex}`
          : implicitFocusableTags.has(tag)
            ? tag
            : href !== null
              ? "href"
              : "not focusable",
      message: passed
        ? "Target is keyboard-focusable."
        : "Target is not keyboard-focusable; the keyboard-access fix did not land.",
    };
  },
});

/**
 * The full accessibility scan input. Each section is optional so a caller can
 * run a partial scan (e.g. only role/name checks). Each section feeds the
 * matching detector in {@link collectAccessibilitySuggestions}.
 */
export interface AccessibilityScan {
  readonly roleName?: RoleNameInput;
  readonly labelControl?: LabelControlInput;
  readonly focusOrder?: FocusOrderInput;
  readonly domVisualOrder?: DomVisualOrderInput;
  readonly keyboardNavigation?: KeyboardNavigationInput;
}

/**
 * Run every supplied detector and return the aggregated, advisory suggestions.
 *
 * This is the advisory entry point required by ADR-017. It produces DATA only;
 * it never touches the DOM or the source. The caller (inspector / agent
 * context) decides what to show and whether to act.
 */
export const collectAccessibilitySuggestions = (
  scan: AccessibilityScan,
): readonly AccessibilitySuggestion[] => {
  const out: AccessibilitySuggestion[] = [];
  if (scan.roleName) out.push(...detectRoleNameIssues(scan.roleName));
  if (scan.labelControl) out.push(...detectLabelControlIssues(scan.labelControl));
  if (scan.focusOrder) out.push(...detectFocusOrderIssues(scan.focusOrder));
  if (scan.domVisualOrder) out.push(...detectDomVisualOrderIssues(scan.domVisualOrder));
  if (scan.keyboardNavigation) out.push(...detectKeyboardNavigationIssues(scan.keyboardNavigation));
  return out;
};

/**
 * Count suggestions by level for a summary. Advisory only — `warn` and `info`
 * are the only levels.
 */
export const summarizeSuggestions = (
  suggestions: readonly AccessibilitySuggestion[],
): { total: number; warn: number; info: number } => ({
  total: suggestions.length,
  warn: suggestions.filter((s) => s.level === "warn").length,
  info: suggestions.filter((s) => s.level === "info").length,
});
