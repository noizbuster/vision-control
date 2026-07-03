/**
 * Mount + render harness for overlay regression scenarios (PRD §31.6).
 *
 * Wires the real overlay-ui factories (`attachOverlayRoot`, `createOverlayElement`,
 * `createSnapGuides`) into a jsdom document, applies a DevTools theme, runs a
 * scenario's render recipe, and returns the live shadow root + themed container
 * the screenshot serializer reads from. The caller MUST `unmount()` between
 * scenarios to keep jsdom clean.
 */

import {
  attachOverlayRoot,
  createOverlayElement,
  createSnapGuides,
  type OverlayElement,
  type OverlayRoot,
  type SnapGuides,
} from "@vision-control/overlay-ui";

import { applyTheme, type DevToolsTheme } from "./devtools-theme.js";
import type { OverlayScenario } from "./overlay-scenarios.js";

/** A mounted, themed, rendered overlay ready for screenshot capture. */
export interface MountedScenario {
  readonly root: OverlayRoot;
  readonly shadowRoot: ShadowRoot;
  readonly container: HTMLElement;
  readonly overlay: OverlayElement;
  readonly snapGuides: SnapGuides;
  /** Detach the overlay host and clear jsdom body. Call between scenarios. */
  readonly unmount: () => void;
}

/**
 * Mount the overlay, apply `theme`, and run `scenario.render`. Returns the live
 * nodes plus an `unmount` that removes the host and resets `document.body`.
 */
export function mountAndRender(scenario: OverlayScenario, theme: DevToolsTheme): MountedScenario {
  const root = attachOverlayRoot();
  const shadowRoot = root.shadowRoot;
  const container = shadowRoot.querySelector(".vc-overlay-root");
  if (!(container instanceof HTMLElement)) {
    root.unmount();
    throw new Error("overlay root container (.vc-overlay-root) not found after attach");
  }

  applyTheme(container, theme);
  const overlay = createOverlayElement(shadowRoot);
  const snapGuides = createSnapGuides(container);
  scenario.render({ overlay, snapGuides });

  const unmount = (): void => {
    root.unmount();
    document.body.innerHTML = "";
  };

  return { root, shadowRoot, container, overlay, snapGuides, unmount };
}
