import type { SuggestionKind } from "./kinds.js";

/**
 * Per-kind precondition templates (VC-V1V2-14 / PRD Appendix D constraint 10).
 *
 * Every deterministic suggestion carries preconditions the consumer (agent or
 * human) MUST verify after HMR. These are the load-bearing guardrail that keeps
 * a deterministic suggestion honest: the consumer applies the diff, rebuilds,
 * and asserts the rendered result matches the suggestion's intent. A suggestion
 * is never "done" until the post-HMR verification passes.
 *
 * Preconditions are advisory text — they describe WHAT to verify, not how to
 * apply the diff. The consumer owns the file-writing mechanism and the
 * verification loop.
 */

const VERIFY_HMR =
  "Verify the rendered result matches the suggestion after HMR before treating the edit as source-complete.";

const PRECONDITIONS: Readonly<Record<SuggestionKind, readonly string[]>> = {
  "tailwind-token-replace": [
    `Verify the element's computed style reflects the new Tailwind token after HMR.`,
    `Verify the className is still present after HMR (no dynamic class overwrote it).`,
    VERIFY_HMR,
  ],
  "css-declaration-replace": [
    `Verify the declaration's computed value matches the suggestion after HMR.`,
    `Verify no other rule with higher specificity overrides the declaration.`,
    VERIFY_HMR,
  ],
  "css-class-replace": [
    `Verify the element still carries the new class after HMR.`,
    `Verify the replaced class is not reapplied by a dynamic className expression.`,
    VERIFY_HMR,
  ],
  "css-modules-local-edit": [
    `Verify the CSS Modules local class declaration matches the suggestion after HMR.`,
    `Verify the composed/hashed class still resolves to the edited local class.`,
    VERIFY_HMR,
  ],
  "inline-style-object-edit": [
    `Verify the inline style object literal matches the suggestion after HMR.`,
    `Verify the style value is not overridden by a dynamic prop or runtime style.`,
    VERIFY_HMR,
  ],
  "jsx-text-edit": [
    `Verify the rendered text matches the suggestion after HMR.`,
    `Verify the text node is not driven by a dynamic expression.`,
    VERIFY_HMR,
  ],
  "simple-reorder": [
    `Verify the DOM order matches the suggested reorder after HMR.`,
    `Verify the reorder does not desync reading order from visual order (accessibility).`,
    VERIFY_HMR,
  ],
  "component-prop-edit": [
    `Verify the component renders with the new prop value after HMR.`,
    `Verify the prop is still a static literal (not overwritten by a dynamic expression).`,
    `Verify the component has not been reparented or moved to a different boundary since the suggestion was generated.`,
    VERIFY_HMR,
  ],
};

/**
 * The preconditions for one suggestion kind. Returned by value so callers can
 * append their own without mutating the shared template.
 */
export const preconditionsFor = (kind: SuggestionKind): readonly string[] => [
  ...PRECONDITIONS[kind],
];
