/**
 * Reconciliation observer: detects when a framework (React, Vue, etc.)
 * reverts a structural preview mutation.
 *
 * After the preview engine moves a DOM node (reorder/reparent), the framework
 *'s next render pass may restore the original DOM structure. This observer
 * watches the element's parent for childList mutations that remove the
 * previewed element, indicating a reconciliation revert.
 *
 * On revert, the caller switches from "actual DOM mutation" to "simulated
 * ghost" mode (see simulated-preview.ts).
 */

import type { PreviewDomAdapter } from "./dom-adapter.js";

export interface ReconciliationObserverOptions {
  readonly dom: PreviewDomAdapter;
  readonly target: Element;
  /** Called when the framework reverts the structural mutation. */
  readonly onRevert: () => void;
}

export interface ReconciliationObserver {
  /** Start watching the target's parent for reconciliation reverts. */
  readonly start: () => void;
  /** Disconnect the underlying MutationObserver. */
  readonly stop: () => void;
  /** Whether a revert has been detected. */
  readonly wasReverted: () => boolean;
}

export function createReconciliationObserver(
  opts: ReconciliationObserverOptions,
): ReconciliationObserver {
  const { dom, target, onRevert } = opts;
  let observer: MutationObserver | null = null;
  let reverted = false;

  const callback: MutationCallback = (mutations: MutationRecord[]): void => {
    if (reverted) return;
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const removed of mutation.removedNodes) {
        if (removed === target || removed.contains(target)) {
          reverted = true;
          onRevert();
          return;
        }
      }
    }
  };

  const start = (): void => {
    const parent = target.parentElement;
    if (parent === null) return;
    observer = dom.createMutationObserver(callback);
    observer.observe(parent, { childList: true, subtree: false });
  };

  const stop = (): void => {
    observer?.disconnect();
    observer = null;
  };

  const wasReverted = (): boolean => reverted;

  return { start, stop, wasReverted };
}
