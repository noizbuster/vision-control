import { z } from "zod";

/**
 * The deterministic suggestion kinds (VC-V1V2-14 / ADR-012 / PRD 7.2 line 298).
 *
 * Each kind names a category of SAFE STATIC edit for which the generator can
 * produce an inert, deterministic `SuggestedDiff` payload. The seven kinds:
 *
 * - `tailwind-token-replace` — replace one Tailwind utility with a neighbor
 *   token (e.g. `gap-2` -> `gap-4`) on a static `className`.
 * - `css-declaration-replace` — replace a static CSS declaration value (e.g.
 *   `color: red` -> `color: blue`).
 * - `css-class-replace` — replace a static class selector / class attribute
 *   token (e.g. `.button` -> `.button-primary`).
 * - `css-modules-local-edit` — edit a CSS Modules local class declaration
 *   (e.g. add/alter a declaration inside `.root`), backed by manifest +
 *   source-map.
 * - `inline-style-object-edit` — edit a static inline style object literal
 *   (e.g. `style={{ padding: 8 }}` -> `style={{ padding: 16 }}`) with an
 *   AST-owned source range.
 * - `jsx-text-edit` — edit static JSX text (e.g. `<button>Save</button>` ->
 *   `<button>Save changes</button>`).
 * - `simple-reorder` — reorder sibling nodes (e.g. `<li>` children) where AST
 *   ownership is unambiguous.
 * - `component-prop-edit` — edit a safe static component prop value (e.g.
 *   `<Button variant="secondary">` -> `<Button variant="primary">`) with an
 *   AST-owned source range. Dynamic/computed prop expressions
 *   (`variant={computeVariant(user)}`) do not produce this kind — they return
 *   agent-required (VC-V1V2-21).
 *
 * Dynamic or computed cases (props.className, conditional class expressions,
 * runtime-generated CSS-in-JS) are NOT represented here: the generator returns
 * an "agent-required" signal for those instead of a suggestion.
 */
export const SUGGESTION_KINDS = [
  "tailwind-token-replace",
  "css-declaration-replace",
  "css-class-replace",
  "css-modules-local-edit",
  "inline-style-object-edit",
  "jsx-text-edit",
  "simple-reorder",
  "component-prop-edit",
] as const;

export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const SuggestionKindSchema = z.enum(SUGGESTION_KINDS);
