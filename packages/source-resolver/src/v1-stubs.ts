import type { AdapterContext, SourceAdapter } from "./adapter-contract.js";
import { createSourceCandidate, type SourceCandidate } from "./source-candidate.js";

/**
 * V1/V2 source-adapter stubs (VC-V1V2-04 / PRD 7.2 scope boundary).
 *
 * Tailwind token-aware editing, CSS Modules mapping, Next.js, Vue, Svelte, and
 * CSS-in-JS are explicitly V1/V2 features. Their real adapters land in Wave 3+
 * tasks (11-14, 18-20). Until then these stubs are first-class
 * {@link SourceAdapter} registrations that return a single LOW candidate with a
 * "not-yet-implemented" warning and NO evidence. Because they carry no
 * evidence, the never-wrong-HIGH policy keeps them at LOW — an agent is never
 * told a Tailwind/CSS-Modules/Next origin is a definitive source location until
 * the real adapter ships.
 *
 * The MVP-era `{ supported: false, diagnostic }` shape is preserved below as
 * thin wrappers so existing callers (context compiler diagnostics, docs) keep
 * compiling. The adapter objects are the new canonical form.
 */

/** Legacy MVP shape: "is this integration available yet?" */
export interface V1StubResult {
  readonly supported: false;
  readonly diagnostic: string;
}

const notImplemented = (feature: string): SourceCandidate =>
  createSourceCandidate({
    confidence: "low",
    evidence: [],
    ownershipRisk: "none",
    warnings: [`${feature} source resolution is not-yet-implemented (V1/V2 feature)`],
  });

/** Build a not-yet-implemented adapter for one framework/styling integration. */
const notImplementedAdapter = (id: string, feature: string): SourceAdapter => ({
  id,
  description: `${feature} source resolution (not-yet-implemented; returns LOW advisory candidate)`,
  resolve: (_context: AdapterContext): readonly SourceCandidate[] => [notImplemented(feature)],
});

/** CSS Modules hashed-class-to-source mapping adapter (V1 — VC-V1V2-12).
 * Real implementation lives in @vision-control/css-modules. */
export { CSS_MODULES_ADAPTER } from "@vision-control/css-modules";
/** Next.js integration adapter — real implementation (VC-V1V2-13). */
export { NEXT_ADAPTER } from "@vision-control/next-react";
/** Svelte adapter — real implementation (VC-V1V2-19). */
export { SVELTE_ADAPTER } from "@vision-control/svelte";
/** Tailwind token-aware editing adapter — real implementation (VC-V1V2-11). */
export { TAILWIND_TOKEN_ADAPTER } from "@vision-control/tailwind";
/** Vue adapter — real implementation (VC-V1V2-19). */
export { VUE_ADAPTER } from "@vision-control/vue";

/** CSS-in-JS (styled-components/emotion/stitches) adapter — real implementation
 * (VC-V1V2-20). Static extractable styles resolve HIGH (ast-origin); dynamic
 * runtime-generated styles are agent-required. */
export { CSS_IN_JS_ADAPTER } from "./css-in-js/index.js";

/** Vanilla CSS adapter (Wave 3+). */
export const VANILLA_CSS_ADAPTER: SourceAdapter = notImplementedAdapter(
  "vanilla-css",
  "Vanilla CSS origin mapping",
);

/**
 * All not-yet-implemented adapter registrations, in a stable order. Callers may
 * register any subset into an {@link AdapterRegistry}. Empty by default in the
 * resolver; populated by Wave 3+ tasks.
 */
export const V1_NOT_IMPLEMENTED_ADAPTERS: readonly SourceAdapter[] = [VANILLA_CSS_ADAPTER];

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
