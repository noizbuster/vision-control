export { hitTest } from "./hit-testing.js";
export {
  type BridgedRectResult,
  bridgeRectToTopFrame,
  OpaqueFrameError,
} from "./iframe-coordinate-bridge.js";
export { createKeyboardController, type KeyboardController } from "./keyboard.js";
export { createPositionObserver, type PositionObserver } from "./observers.js";
export {
  createOverlayElement,
  type OverlayElement,
  type SelectionOverlayState,
} from "./overlay-element.js";
export {
  attachOverlayRoot,
  isOverlayElement,
  OVERLAY_HOST_ATTR,
  type OverlayRoot,
} from "./overlay-root.js";
export { PACKAGE_NAME } from "./package-name.js";
export {
  getDefaultPointerEventsForRole,
  type PointerEventMode,
  setHandlePointerEvents,
  setHostPointerEvents,
} from "./pointer-events-policy.js";
