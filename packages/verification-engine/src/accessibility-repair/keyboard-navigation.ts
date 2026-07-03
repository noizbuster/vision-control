/**
 * Keyboard-navigation accessibility suggestions (ADR-017 / PRD line 1994).
 *
 * Detects interactive elements that are not keyboard-accessible: clickable
 * elements (custom widgets with a click handler) that lack a `role`, `tabindex`,
 * or focusable tag; `<a>` elements without an `href` (not focusable); and
 * elements that are operable with the mouse but not the keyboard. Advisory only.
 *
 * The recommendation (WCAG 2.1.1): every interactive element must be reachable
 * and operable via keyboard. The most common fix is adding `tabindex="0"` and an
 * appropriate `role`, or using a native interactive element.
 */

import type { AccessibilitySuggestion } from "./suggested-fixes.js";
import { buildAttributePresentAssertion, buildFocusableAssertion } from "./suggested-fixes.js";

/**
 * A projected element for keyboard-navigation analysis. `hasClickHandler` is set
 * by the browser adapter when it observes a `click` listener or an `onclick`
 * attribute (custom interactive widgets).
 */
export interface KeyboardNavigationElement {
  readonly tagName: string;
  readonly role?: string;
  readonly tabindex?: string;
  readonly href?: string;
  /** True when the adapter detected a click listener or onclick attribute. */
  readonly hasClickHandler?: boolean;
}

export type KeyboardNavigationInput = readonly KeyboardNavigationElement[];

/** Native interactive tags that are focusable by default. */
export const NATIVELY_FOCUSABLE_TAGS: ReadonlySet<string> = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
]);

/** True when an element is keyboard-focusable by construction. */
export const isKeyboardFocusable = (el: KeyboardNavigationElement): boolean => {
  const tag = el.tagName.toLowerCase();
  if (NATIVELY_FOCUSABLE_TAGS.has(tag)) {
    // <a> without href is not focusable.
    if (tag === "a" && (el.href === undefined || el.href === "")) return false;
    return true;
  }
  const n =
    el.tabindex !== undefined && el.tabindex !== "" ? Number.parseInt(el.tabindex, 10) : undefined;
  return n !== undefined && n >= 0;
};

/**
 * Detect keyboard-navigation gaps. Flags clickable custom widgets without focus
 * access, links without href, and interactive elements missing a role.
 */
export const detectKeyboardNavigationIssues = (
  elements: KeyboardNavigationInput,
): readonly AccessibilitySuggestion[] => {
  const out: AccessibilitySuggestion[] = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el) continue;
    const tag = el.tagName.toLowerCase();

    // Custom widget with a click handler but no keyboard access.
    if (
      el.hasClickHandler === true &&
      !NATIVELY_FOCUSABLE_TAGS.has(tag) &&
      !isKeyboardFocusable(el)
    ) {
      out.push({
        code: "clickable-widget-not-keyboard-accessible",
        level: "warn",
        message: `Element <${tag}> has a click handler but is not keyboard-focusable (no native focusable tag, no non-negative tabindex). Mouse-only operability violates WCAG 2.1.1.`,
        remediation: `Add tabindex="0" and an appropriate role (e.g. role="button"), plus keyboard event handlers (keydown/keyup) for activation. Prefer a native <button> when possible.`,
        verificationAssertion: buildFocusableAssertion(),
      });
    }

    // Link without href is not focusable.
    if (tag === "a" && (el.href === undefined || el.href === "")) {
      out.push({
        code: "link-without-href-not-focusable",
        level: "warn",
        message: `<a> element without an href is not keyboard-focusable and is removed from the tab sequence.`,
        remediation: `Add an href (use href="#" or a real target with role="button" for button-like links) or switch to a <button>.`,
        verificationAssertion: buildAttributePresentAssertion("href"),
      });
    }

    // Interactive element missing a role (custom widget semantics).
    if (
      el.hasClickHandler === true &&
      !NATIVELY_FOCUSABLE_TAGS.has(tag) &&
      (el.role === undefined || el.role === "")
    ) {
      out.push({
        code: "interactive-widget-missing-role",
        level: "info",
        message: `Clickable <${tag}> has no explicit role; assistive technology cannot announce its purpose.`,
        remediation: `Add a role matching the widget's behavior (e.g. role="button", role="link", role="tab") and an accessible name.`,
        verificationAssertion: buildAttributePresentAssertion("role"),
      });
    }
  }
  return out;
};
