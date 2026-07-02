/**
 * Shared types for the verification engine.
 *
 * The verification engine proves that a source patch landed in the live DOM
 * after HMR. Its data flow: resolve the target element (reacquired post-HMR),
 * run a list of assertions against the cleared DOM, and compile a structured
 * pass/fail report with a retry context for the agent (PRD section 12.5).
 *
 * CRITICAL: assertions run ONLY after the preview layer is cleared. A preview
 * that renders correctly does NOT prove the source changed (Appendix D.1).
 */

import type { IdentityConfidence } from "@vision-control/element-identity";

import type { VerificationDomAdapter } from "./dom-adapter.js";

/**
 * A resolved target element after HMR/reload. Carries the DOM handle, the
 * adapter lens to read it through, and the identity metadata used to find it.
 *
 * `confidence` follows the element-identity priority order (PRD 18.3):
 * `high` (source id + fingerprint stable) → `medium` (role/name + selector) →
 * `low` (fingerprint-only or nth-child).
 */
export interface ResolvedTarget {
  readonly element: Element;
  readonly dom: VerificationDomAdapter;
  readonly runtimeId: string;
  readonly sourceId?: string;
  readonly selector?: string;
  readonly confidence: IdentityConfidence;
}

/**
 * One assertion result. `expected` and `actual` are stringified for the report
 * so the agent can read them without knowing the assertion's value types.
 */
export interface AssertionResult {
  readonly name: string;
  readonly passed: boolean;
  readonly expected: string;
  readonly actual: string;
  readonly message: string;
}

/**
 * A single assertion entry in a verification plan. `run` executes the assertion
 * against a resolved target and returns its result.
 */
export interface AssertionEntry {
  readonly name: string;
  readonly run: (target: ResolvedTarget) => AssertionResult;
}

/**
 * Identity hints used to reacquire the target element after HMR/reload. The
 * resolver tries each hint in priority order (source id → role/name → selector
 * → fingerprint). All fields are optional because not every element is
 * source-marked or has a role.
 */
export interface SourceCandidate {
  readonly sourceId?: string;
  readonly role?: string;
  readonly name?: string;
  readonly selector?: string;
  readonly fingerprint?: string;
  readonly tagName?: string;
}

/**
 * A verification plan: the identity hints plus the list of assertions to run.
 * Built by {@link createPlan} from a source operation, or assembled manually.
 */
export interface VerificationPlan {
  readonly sourceCandidate: SourceCandidate;
  readonly assertions: readonly AssertionEntry[];
}

/**
 * Structured verdict after running a plan. Each entry in `assertions` carries
 * expected vs actual for the agent. `retryContext` is present only on failure.
 */
export interface VerificationReport {
  readonly verdict: "pass" | "fail";
  readonly assertions: readonly AssertionResult[];
  readonly target: ResolvedTarget | null;
  readonly retryContext?: string;
}

/**
 * Structural interface the runner accepts for preview clearing. The real
 * `PreviewManager` from `@vision-control/preview-engine` satisfies this without
 * a hard dependency edge (same structural-compat pattern change-ir uses for
 * ElementRef). Keeps the verification engine's dependency graph lean.
 */
export interface PreviewClearer {
  readonly activeCount: number;
  clearAll: () => void;
}

/** Default pixel tolerance for geometry assertions (handles subpixel rounding). */
export const DEFAULT_GEOMETRY_TOLERANCE = 1;

/** Default HMR timeout in milliseconds. */
export const DEFAULT_HMR_TIMEOUT_MS = 5000;

/** Default DOM-stability window: no mutations for this long ⇒ HMR complete. */
export const DEFAULT_STABILITY_WINDOW_MS = 100;
