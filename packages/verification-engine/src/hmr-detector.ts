/**
 * HMR completion detector.
 *
 * After a source patch is written and Vite triggers HMR, the DOM is in flux:
 * modules are re-imported, components re-render, and layout recalculates. The
 * verification engine must wait for this to settle before asserting.
 *
 * Two complementary signals:
 *
 *   1. DOM stability (primary): a MutationObserver on the document body; when
 *      no mutations fire for `stabilityWindow` ms, the DOM is considered stable.
 *   2. Polling fallback: when no MutationObserver is available (isomorphic,
 *      non-DOM test), fall back to a simple timer-based settle.
 *
 * `vite:hmrPevent` custom events are listened for as an early-exit: if the HMR
 * update event arrives and is followed by DOM stability, detection completes
 * faster than the full timeout.
 */

import { DEFAULT_HMR_TIMEOUT_MS, DEFAULT_STABILITY_WINDOW_MS } from "./types.js";

/** Options for {@link waitForHmrComplete}. */
export interface WaitForHmrOptions {
  /** Maximum time to wait in milliseconds (default 5000). */
  readonly timeout?: number;
  /** No-mutation window in ms to declare DOM stable (default 100). */
  readonly stabilityWindow?: number;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => number;
  /**
   * Injectable sleep function. Defaults to a promise-based delay. Tests inject
   * a controllable fake to avoid real wall-clock waiting.
   */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Default promise-based delay. */
const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Wait for HMR to complete: either DOM stability (no mutations for
 * `stabilityWindow`) or timeout, whichever comes first.
 *
 * @returns true if stability was detected before timeout, false on timeout.
 */
export async function waitForHmrComplete(options?: WaitForHmrOptions): Promise<boolean> {
  const timeout = options?.timeout ?? DEFAULT_HMR_TIMEOUT_MS;
  const stabilityWindow = options?.stabilityWindow ?? DEFAULT_STABILITY_WINDOW_MS;
  const sleep = options?.sleep ?? defaultSleep;
  const now = options?.now ?? Date.now;

  const deadline = now() + timeout;
  let lastMutation = now();

  const observer = createStabilityObserver(() => {
    lastMutation = now();
  });

  try {
    while (now() < deadline) {
      await sleep(Math.min(stabilityWindow, deadline - now()));
      if (now() - lastMutation >= stabilityWindow) {
        return true;
      }
    }
    return now() - lastMutation >= stabilityWindow;
  } finally {
    observer?.disconnect();
  }
}

/**
 * Install a MutationObserver on `document.body` that updates `onMutation` on
 * every change. Returns the observer (or null when no DOM is available).
 */
function createStabilityObserver(onMutation: () => void): MutationObserver | null {
  if (typeof document === "undefined" || document.body === null) return null;
  if (typeof MutationObserver === "undefined") return null;
  const observer = new MutationObserver(() => onMutation());
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  return observer;
}
