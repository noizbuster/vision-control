/**
 * Simulated preview: ghost/placeholder fallback when React reconciliation
 * reverts a structural DOM mutation.
 *
 * The preview engine cannot import overlay-ui (browser-only) directly — it is
 * isomorphic. Instead, the caller injects a {@link GhostRenderer} that knows
 * how to draw a ghost element in the overlay. The extension wires this to
 * overlay-ui's shadow-DOM overlay element.
 *
 * The operation intent is preserved (the journal still records
 * `reparent-element`), but the preview is visual-only: the ghost shows where
 * the element WOULD be after the operation, while the actual DOM stays in its
 * framework-reconciled state.
 */

import type { Operation } from "@vision-control/change-ir";

import type { PreviewRect } from "./dom-adapter.js";

/**
 * Contract for rendering a ghost element. The extension provides an impl that
 * delegates to overlay-ui. This keeps preview-engine free of the browser-only
 * overlay-ui dependency.
 */
export interface GhostRenderer {
  /** Show a ghost at the given position. */
  readonly showGhost: (rect: PreviewRect) => void;
  /** Hide the ghost. */
  readonly hideGhost: () => void;
  /** Whether a ghost is currently visible. */
  readonly isGhostVisible: () => boolean;
}

export interface SimulatedPreview {
  readonly operation: Operation;
  /** Whether this simulated preview is currently active (ghost shown). */
  readonly isActive: () => boolean;
  /** Activate: show the ghost at the target position. */
  readonly activate: (rect: PreviewRect) => void;
  /** Deactivate: hide the ghost. */
  readonly deactivate: () => void;
}

export function createSimulatedPreview(
  operation: Operation,
  renderer: GhostRenderer,
): SimulatedPreview {
  let active = false;

  const activate = (rect: PreviewRect): void => {
    active = true;
    renderer.showGhost(rect);
  };

  const deactivate = (): void => {
    if (!active) return;
    renderer.hideGhost();
    active = false;
  };

  return {
    operation,
    isActive: () => active,
    activate,
    deactivate,
  };
}

/**
 * A no-op ghost renderer for environments without an overlay (e.g. tests that
 * do not exercise the simulated fallback, or headless verification).
 */
export const noopGhostRenderer: GhostRenderer = {
  showGhost: (): void => {},
  hideGhost: (): void => {},
  isGhostVisible: (): boolean => false,
};
