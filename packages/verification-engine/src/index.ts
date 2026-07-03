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

// V2 (VC-V1V2-24 / ADR-017): advisory accessibility repair suggestions. Each
// suggestion carries a deterministic verification assertion; the system never
// auto-mutates the DOM or source (advisory only).
export {
  type AccessibilityRepairLevel,
  type AccessibilityScan,
  type AccessibilitySuggestion,
  assertReadingOrderPreserved as assertReadingOrderPreservedRepair,
  buildAccessibleNameAssertion,
  buildAttributePresentAssertion,
  buildFocusableAssertion,
  buildRoleAssertion,
  collectAccessibilitySuggestions,
  type DomVisualOrderInput,
  detectDomVisualOrderIssues,
  detectFocusOrderIssues,
  detectKeyboardNavigationIssues,
  detectLabelControlIssues,
  detectRoleNameIssues,
  type FocusOrderElement,
  type FocusOrderInput,
  hasAccessibleName,
  hasAccessibleNameSource,
  isKeyboardFocusable,
  type KeyboardNavigationElement,
  type KeyboardNavigationInput,
  type LabelControlElement,
  type LabelControlInput,
  parseTabindex,
  type RoleNameElement,
  type RoleNameInput,
  summarizeSuggestions,
} from "./accessibility-repair/index.js";
export {
  type AlignmentAccessibilityLevel,
  type AlignmentAccessibilityWarning,
  assertReadingOrderPreserved,
  detectCssOrderPresent,
  detectCssOrderUsage,
  detectDomVisualOrderDesync,
} from "./alignment-accessibility.js";
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
// V1 (VC-V1V2-15 / ADR-011): opt-in screenshot crop capture, redaction, diff,
// and short-retention cleanup. Opt-in only — default context exports exclude
// screenshots entirely (enforced in the context-compiler opt-in gate).
export {
  type CaptureRequest,
  type CssRect,
  captureScreenshotCrop,
  type DeviceRect,
  type OverlaySuppressor,
  type ScreenshotCaptureAdapter,
  type ScreenshotCaptureInput,
  type ScreenshotCropResult,
  type ScreenshotOptIn,
  type ScreenshotRedactionLens,
  scaleToDevice,
} from "./screenshot-crop.js";
export {
  assertScreenshotSimilarity,
  byteSimilarity,
  DEFAULT_DIFF_THRESHOLD,
  type ScreenshotCropData,
  type ScreenshotDiffOptions,
  type ScreenshotDiffResult,
} from "./screenshot-diff.js";
export {
  buildRedactionReport,
  classifyRegion,
  type DomRegionCandidate,
  discoverRedactableRegions,
  type RecheckResult,
  type RedactableRegion,
  type RedactionReason,
  type RedactionReport,
  recheckCapture,
} from "./screenshot-redaction.js";
export {
  computeExpiry,
  DEFAULT_RETENTION_POLICY,
  DEFAULT_SCREENSHOT_RETENTION_MS,
  type RetentionCleanupResult,
  type RetentionPolicy,
  type RetentionSweepRepository,
  type RetentionSweepRow,
  runRetentionCleanup,
} from "./screenshot-retention.js";
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
