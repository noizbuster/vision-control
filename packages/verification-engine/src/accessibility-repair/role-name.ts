/**
 * Role/name accessibility repair suggestions (ADR-017 / PRD lines 1989-1990).
 *
 * Detects interactive elements that lack an accessible name (no `aria-label`,
 * `aria-labelledby`, or text content) and elements whose explicit `role`
 * contradicts their implicit semantics. Advisory only — produces suggestions,
 * never rewrites the DOM.
 */

import type { AccessibilitySuggestion } from "./suggested-fixes.js";
import { buildAccessibleNameAssertion, buildRoleAssertion } from "./suggested-fixes.js";

/**
 * A projected view of one element for role/name analysis. The browser adapter
 * scans the page and projects each element into this descriptor; the detector
 * runs as pure isomorphic logic (no live `Element`, keeps this package
 * jsdom-testable — same separation as the screenshot-redaction DomRegionCandidate).
 */
export interface RoleNameElement {
  readonly tagName: string;
  /** Explicit `role` attribute, if any. */
  readonly role?: string;
  readonly ariaLabel?: string;
  readonly ariaLabelledby?: string;
  /** Visible text content, trimmed. Used as the accessible-name fallback. */
  readonly text?: string;
}

export type RoleNameInput = readonly RoleNameElement[];

/** Tags whose semantics imply interactivity and therefore require a name. */
export const INTERACTIVE_TAGS: ReadonlySet<string> = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
]);

/** Minimal implicit-role table (mirrors assertions/accessibility.ts locally). */
export const IMPLICIT_ROLE: Readonly<Record<string, string>> = {
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
  h4: "heading",
  h5: "heading",
  h6: "heading",
};

/** True when an element has any usable accessible-name source. */
export const hasAccessibleName = (el: RoleNameElement): boolean => {
  const ariaLabel = el.ariaLabel?.trim();
  if (ariaLabel && ariaLabel.length > 0) return true;
  if (el.ariaLabelledby && el.ariaLabelledby.trim().length > 0) return true;
  const text = el.text?.trim();
  if (text && text.length > 0) return true;
  return false;
};

/**
 * Detect interactive elements missing an accessible name, plus elements whose
 * explicit `role` overrides their implicit role (a correctness risk worth
 * surfacing). Returns advisory suggestions, each carrying a verification
 * assertion so a fix can be checked after it lands.
 */
export const detectRoleNameIssues = (
  elements: RoleNameInput,
): readonly AccessibilitySuggestion[] => {
  const out: AccessibilitySuggestion[] = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el) continue;
    const tag = el.tagName.toLowerCase();

    if (INTERACTIVE_TAGS.has(tag) && !hasAccessibleName(el)) {
      const expected = el.ariaLabel?.trim() || el.text?.trim() || "";
      out.push({
        code: "missing-accessible-name",
        level: "warn",
        message: `Interactive <${tag}> has no accessible name (no aria-label, aria-labelledby, or text content). Screen readers will announce it without a label.`,
        remediation: `Add an aria-label, wrap visible text, or associate a <label> so the element has an accessible name.`,
        verificationAssertion: buildAccessibleNameAssertion(expected),
      });
    }

    const implicit = IMPLICIT_ROLE[tag];
    if (el.role && implicit && el.role !== implicit) {
      out.push({
        code: "role-contradicts-implicit",
        level: "info",
        message: `Element <${tag}> has role=${JSON.stringify(el.role)} which overrides its implicit role ${JSON.stringify(implicit)}. Verify this is intentional.`,
        remediation: `Either remove the explicit role to restore the implicit semantics, or confirm the override matches the element's purpose.`,
        verificationAssertion: buildRoleAssertion(el.role),
      });
    }
  }
  return out;
};
