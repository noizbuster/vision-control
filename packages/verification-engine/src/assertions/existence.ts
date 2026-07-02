/**
 * Existence assertion: the target element is still connected to the document.
 *
 * After HMR/reload the element may have been unmounted (component removed,
 * conditional render). This assertion catches that the source patch target
 * still exists in the live DOM.
 */

import type { AssertionResult, ResolvedTarget } from "../types.js";

/** Assert the target element is connected to the document. */
export function assertExists(target: ResolvedTarget): AssertionResult {
  const connected = target.dom.isConnected(target.element);
  return {
    name: "exists",
    passed: connected,
    expected: "element connected to document",
    actual: connected ? "connected" : "disconnected (unmounted)",
    message: connected
      ? "Element is present in the live DOM."
      : "Element is not connected to the document — it may have been unmounted or the source patch removed it.",
  };
}
