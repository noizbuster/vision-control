/**
 * Pseudo-element / pseudo-state runtime preview (VC-V1V2-20 / PRD 7.3).
 *
 * Previews edits to `::before`, `::after`, `:hover`, `:focus`, etc. by
 * synthesizing a CSS rule through the {@link StylesheetManager} — a temporary
 * `<style>` injection into the page head. This is PREVIEW ONLY: it does NOT
 * mutate the live CSSOM as source truth (the source of truth is the CSS rule /
 * CSS-in-JS definition in the workspace, resolved by source-resolver). The
 * verification engine calls `clearAll()` before asserting source-patched state.
 *
 * The preview selector targets the host element by its preview-id attribute and
 * appends the pseudo class, e.g. `[data-vc-preview-id="rt-001"]::before`. This
 * is a distinct stylesheet key from a regular style preview, so the two never
 * collide.
 */

import type { RollbackFn } from "./adapters/preview-adapter.js";
import { PREVIEW_ID_ATTR } from "./dom-adapter.js";
import type { StylesheetManager } from "./stylesheet-manager.js";

/** Pseudo-elements whose computed style is readable via `getComputedStyle(el, "::before")`. */
export const PSEUDO_PREVIEW_ELEMENTS = ["::before", "::after"] as const;
export type PseudoPreviewElement = (typeof PSEUDO_PREVIEW_ELEMENTS)[number];

/** Any pseudo target accepted by the preview (element or state). */
export type PseudoPreviewTarget =
  | PseudoPreviewElement
  | ":hover"
  | ":focus"
  | ":active"
  | ":disabled";

/**
 * Input for a pseudo-element/state preview. Mirrors the source-resolver
 * `PseudoElementEdit` shape (defined locally here because preview-engine does
 * not depend on source-resolver — same structural-typing decoupling as the
 * css-modules/tailwind adapter local contracts).
 */
export interface PseudoPreviewInput {
  readonly runtimeId: string;
  readonly pseudoClass: PseudoPreviewTarget;
  readonly property: string;
  readonly value: string;
  readonly important?: boolean;
}

/** Build the preview selector for a pseudo target (host + pseudo class). */
export const pseudoPreviewSelector = (
  runtimeId: string,
  pseudoClass: PseudoPreviewTarget,
): string => `[${PREVIEW_ID_ATTR}="${runtimeId}"]${pseudoClass}`;

/**
 * Apply a pseudo-element/state edit as a synthesized preview CSS rule. Returns
 * a rollback that removes the rule. Preview only — never source truth.
 */
export const applyPseudoPreview = (
  stylesheet: StylesheetManager,
  input: PseudoPreviewInput,
): RollbackFn => {
  const selector = pseudoPreviewSelector(input.runtimeId, input.pseudoClass);
  const important = input.important === true ? " !important" : "";
  const declarations = `${input.property}: ${input.value}${important};`;
  stylesheet.applyRule(selector, declarations);
  return (): void => {
    stylesheet.removeRule(selector);
  };
};

/** Result of a pseudo-element computed-style assertion. */
export interface PseudoElementAssertionResult {
  readonly pass: boolean;
  readonly property: string;
  readonly actual: string;
  readonly expected: string;
  readonly pseudoElement: PseudoPreviewElement;
}

/**
 * Read the computed style of a pseudo-element and compare it to the expected
 * value. Uses the two-argument `getComputedStyle(element, "::before")` form,
 * which is the only way to read a pseudo-element's resolved declarations.
 *
 * For pseudo-STATES (`:hover`, `:focus`) there is no equivalent read path — the
 * browser does not resolve state styles until the state is active — so this
 * assertion is restricted to pseudo-ELEMENTS. State-preview verification checks
 * the synthesized rule was inserted (via the stylesheet manager), not the
 * computed style.
 *
 * @param getComputedStyle - the host `window.getComputedStyle` (or a fake).
 * @param element - the host element the pseudo is attached to.
 * @param pseudoElement - `::before` or `::after`.
 * @param property - the CSS property to assert (e.g. `content`, `color`).
 * @param expected - the expected resolved value.
 */
export const assertPseudoElementStyle = (
  getComputedStyle: (element: Element, pseudoElt: string) => CSSStyleDeclaration,
  element: Element,
  pseudoElement: PseudoPreviewElement,
  property: string,
  expected: string,
): PseudoElementAssertionResult => {
  const computed = getComputedStyle(element, pseudoElement);
  const actual = computed.getPropertyValue(property);
  return {
    pass: actual === expected,
    property,
    actual,
    expected,
    pseudoElement,
  };
};
