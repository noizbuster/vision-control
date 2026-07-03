import type { SourceAdapter } from "./adapter-contract.js";

/**
 * V1/V2 source-adapter registry (VC-V1V2-04 / PRD 7.2 scope boundary).
 *
 * Every Wave 3+ styling/framework integration (Tailwind 11, CSS Modules 12,
 * Next 13, Vue/Svelte 19, CSS-in-JS 20, Vanilla CSS 15.3) now ships a REAL
 * adapter from its integration package; this module re-exports them so callers
 * have a single import surface. The not-yet-implemented stub machinery is gone:
 * {@link V1_NOT_IMPLEMENTED_ADAPTERS} is empty, signalling that all planned
 * Wave 3+ adapters have landed. The never-wrong-HIGH policy (enforced by the
 * resolver on every candidate regardless) remains the load-bearing guardrail.
 *
 * The MVP-era `{ supported: false, diagnostic }` shape is preserved below as
 * thin wrappers so existing callers (context compiler diagnostics, docs) keep
 * compiling.
 */

/** Legacy MVP shape: "is this integration available yet?" */
export interface V1StubResult {
  readonly supported: false;
  readonly diagnostic: string;
}

/** CSS Modules hashed-class-to-source mapping adapter (V1 — VC-V1V2-12).
 * Real implementation lives in @vision-control/css-modules. */
export { CSS_MODULES_ADAPTER } from "@vision-control/css-modules";
/** Next.js integration adapter — real implementation (VC-V1V2-13). */
export { NEXT_ADAPTER } from "@vision-control/next-react";
/** Svelte adapter — real implementation (VC-V1V2-19). */
export { SVELTE_ADAPTER } from "@vision-control/svelte";
/** Tailwind token-aware editing adapter — real implementation (VC-V1V2-11). */
export { TAILWIND_TOKEN_ADAPTER } from "@vision-control/tailwind";
/** Vanilla CSS adapter — real implementation (PRD §15.3 / Task 45). */
export { VANILLA_CSS_ADAPTER } from "@vision-control/vanilla-css";
/** Vue adapter — real implementation (VC-V1V2-19). */
export { VUE_ADAPTER } from "@vision-control/vue";
/** CSS-in-JS (styled-components/emotion/stitches) adapter — real implementation
 * (VC-V1V2-20). Static extractable styles resolve HIGH (ast-origin); dynamic
 * runtime-generated styles are agent-required. */
export { CSS_IN_JS_ADAPTER } from "./css-in-js/index.js";

/**
 * All not-yet-implemented adapter registrations, in a stable order. Callers may
 * register any subset into an {@link AdapterRegistry}. Empty by default in the
 * resolver.
 *
 * This list is now EMPTY: every Wave 3+ adapter (Tailwind, CSS Modules, Next,
 * Vue, Svelte, CSS-in-JS, Vanilla CSS) has shipped its real implementation.
 * Task 48's release-readiness gate asserts no adapter id remains here.
 */
export const V1_NOT_IMPLEMENTED_ADAPTERS: readonly SourceAdapter[] = [];

// --- Legacy MVP-era stubs (kept for backward compatibility) -----------------

/** Tailwind token-aware editing is a V1 feature (PRD 7.2). */
export const TAILWIND_TOKEN_STUB: V1StubResult = {
  supported: false,
  diagnostic: "Tailwind token-aware editing is a V1 feature",
} as const;

/** CSS Modules hashed-class-to-source mapping is a V1 feature (PRD 7.2). */
export const CSS_MODULES_STUB: V1StubResult = {
  supported: false,
  diagnostic: "CSS Modules mapping is a V1 feature",
} as const;

/** Check whether Tailwind token-aware resolution is available. */
export const checkTailwindTokenSupport = (): V1StubResult => TAILWIND_TOKEN_STUB;

/** Check whether CSS Modules mapping is available. */
export const checkCssModulesSupport = (): V1StubResult => CSS_MODULES_STUB;
