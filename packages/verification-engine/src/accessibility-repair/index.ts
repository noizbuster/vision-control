/**
 * Accessibility repair suggestions (ADR-017 / PRD lines 1987-2003, 2307-2401).
 *
 * Advisory only. Each detector produces suggestion DATA plus a deterministic
 * verification assertion. The system never auto-mutates the DOM or the source
 * for an accessibility fix; a fix becomes real only through the standard edit
 * pipeline (change IR -> preview -> source patch -> HMR verification).
 *
 * Detectors run on isomorphic element descriptors (no live `Element`), mirroring
 * the screenshot-redaction DomRegionCandidate pattern so every branch is
 * unit-testable in jsdom.
 */

export {
  assertReadingOrderPreserved,
  type DomVisualOrderInput,
  detectDomVisualOrderIssues,
} from "./dom-visual-order.js";
export {
  detectFocusOrderIssues,
  type FocusOrderElement,
  type FocusOrderInput,
  parseTabindex,
} from "./focus-order.js";
export {
  detectKeyboardNavigationIssues,
  isKeyboardFocusable,
  type KeyboardNavigationElement,
  type KeyboardNavigationInput,
  NATIVELY_FOCUSABLE_TAGS,
} from "./keyboard-navigation.js";
export {
  detectLabelControlIssues,
  hasAccessibleNameSource,
  LABELABLE_TAGS,
  type LabelControlElement,
  type LabelControlInput,
} from "./label-control.js";
export {
  detectRoleNameIssues,
  hasAccessibleName,
  IMPLICIT_ROLE,
  INTERACTIVE_TAGS,
  type RoleNameElement,
  type RoleNameInput,
} from "./role-name.js";
export {
  type AccessibilityRepairLevel,
  type AccessibilityScan,
  type AccessibilitySuggestion,
  buildAccessibleNameAssertion,
  buildAttributePresentAssertion,
  buildFocusableAssertion,
  buildRoleAssertion,
  collectAccessibilitySuggestions,
  summarizeSuggestions,
} from "./suggested-fixes.js";
