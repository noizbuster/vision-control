/**
 * @vision-control/verification-engine — HMR assertion engine.
 *
 * Proves that a source patch landed in the live DOM after Vite HMR. The engine:
 *
 *   - waits for DOM stability (HMR complete),
 *   - clears the preview layer (MANDATORY anti-cheat, PRD Appendix D.1),
 *   - reacquires the target element by source id / role / selector / fingerprint,
 *   - runs a plan of assertions against the cleared DOM,
 *   - compiles a structured pass/fail report with a retry context for the agent.
 *
 * A preview that renders correctly does NOT prove the source changed. That
 * distinction is the backbone of every guardrail here.
 */

export { assertName, assertRole } from "./assertions/accessibility.js";
export { assertClass, type ExpectedClass } from "./assertions/class.js";
export { assertComputedStyle, type ExpectedStyle } from "./assertions/computed-style.js";
export { assertConsoleClean } from "./assertions/console-policy.js";
// Assertion functions.
export { assertExists } from "./assertions/existence.js";
export { assertGeometry } from "./assertions/geometry.js";
export { assertParent } from "./assertions/parent.js";
export { assertSiblingOrder } from "./assertions/sibling-order.js";
export { assertText } from "./assertions/text.js";
export {
  type ConsoleEntry,
  createBrowserVerificationDomAdapter,
  VERIFICATION_ATTRS,
  type VerificationDomAdapter,
} from "./dom-adapter.js";
export { type WaitForHmrOptions, waitForHmrComplete } from "./hmr-detector.js";
export { type ResolveTargetOptions, resolveTarget } from "./target-resolver.js";
export {
  type AssertionEntry,
  type AssertionResult,
  DEFAULT_GEOMETRY_TOLERANCE,
  DEFAULT_HMR_TIMEOUT_MS,
  DEFAULT_STABILITY_WINDOW_MS,
  type PreviewClearer,
  type ResolvedTarget,
  type SourceCandidate,
  type VerificationPlan,
  type VerificationReport,
} from "./types.js";
export { createPlan } from "./verification-plan.js";
export { runVerification, type VerificationRunnerOptions } from "./verification-runner.js";

export const PACKAGE_NAME = "@vision-control/verification-engine";
