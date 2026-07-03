/**
 * @vision-control/preview-engine — reversible runtime preview engine.
 *
 * Applies visual mutations to the DOM that are temporary and fully
 * reversible. The journal records INTENT; this engine renders the VISUAL
 * EFFECT. The verification engine calls `clearAll()` before asserting
 * source-patched state.
 *
 * Preview is NOT source truth (PRD §13, Appendix D.1).
 */

export { applyClassPreview, type ClassOperation } from "./adapters/class-adapter.js";
export { assertNever, type RollbackFn } from "./adapters/preview-adapter.js";
export {
  applyReorderPreview,
  applyReparentPreview,
  applyStructuralPreview,
  type StructuralOperation,
} from "./adapters/structural-adapter.js";
export {
  applyResizePreview,
  applyStylePreview,
} from "./adapters/style-adapter.js";
export { applyTextPreview } from "./adapters/text-adapter.js";
export { applyTransformPreview, type TransformPreviewInput } from "./adapters/transform-adapter.js";
export {
  detectSpecificityConflict,
  type SpecificityConflictDiagnostic,
} from "./diagnostics.js";
export {
  buildPreviewSelector,
  createBrowserPreviewDomAdapter,
  PREVIEW_ID_ATTR,
  PREVIEW_STYLE_ATTR,
  type PreviewDomAdapter,
  type PreviewRect,
} from "./dom-adapter.js";
export { PACKAGE_NAME } from "./package-name.js";
export {
  createPreviewManager,
  type PreviewManager,
  type PreviewManagerOptions,
} from "./preview-manager.js";
export {
  createPreviewTransaction,
  type PreviewTransaction,
  type TransactionCallbacks,
  type TransactionState,
  TransactionStateError,
} from "./preview-transaction.js";
export {
  applyPseudoPreview,
  assertPseudoElementStyle,
  PSEUDO_PREVIEW_ELEMENTS,
  type PseudoElementAssertionResult,
  type PseudoPreviewElement,
  type PseudoPreviewInput,
  type PseudoPreviewTarget,
  pseudoPreviewSelector,
} from "./pseudo-preview.js";
export {
  createReconciliationObserver,
  type ReconciliationObserver,
  type ReconciliationObserverOptions,
} from "./reconciliation-observer.js";
export {
  createSimulatedPreview,
  type GhostRenderer,
  noopGhostRenderer,
  type SimulatedPreview,
} from "./simulated-preview.js";
export {
  applyCssRule,
  createStylesheetManager,
  type StylesheetManager,
} from "./stylesheet-manager.js";
