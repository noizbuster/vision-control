/**
 * Shadow DOM overlay root management.
 *
 * Creates a host element, attaches an open shadow root, and injects the overlay
 * design-system CSS. The shadow root keeps all overlay markup and styles
 * isolated from the inspected page.
 */

import { OVERLAY_CSS, OVERLAY_ROOT_CLASS } from "./styles.js";

/** Identifying attribute for the overlay host element. */
export const OVERLAY_HOST_ATTR = "data-vc-overlay-host";

/** API returned by {@link attachOverlayRoot}. */
export interface OverlayRoot {
  /** The host element appended to the page. */
  readonly host: HTMLElement;
  /** The open shadow root attached to the host. */
  readonly shadowRoot: ShadowRoot;
  /** Remove the host from the DOM and release the shadow root. */
  readonly unmount: () => void;
}

/**
 * Create and attach the overlay host to the document root.
 *
 * The host is positioned fixed over the whole viewport and has
 * `pointer-events: none` by default so it never blocks page interaction. All
 * overlay content lives inside the open shadow root.
 */
export function attachOverlayRoot(targetDocument: Document = document): OverlayRoot {
  const host = targetDocument.createElement("div");
  host.setAttribute(OVERLAY_HOST_ATTR, "");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = [
    "position: fixed",
    "inset: 0",
    "pointer-events: none",
    "z-index: 2147483647",
    "overflow: hidden",
  ].join(";");

  const shadowRoot = host.attachShadow({ mode: "open" });

  const style = targetDocument.createElement("style");
  style.textContent = OVERLAY_CSS;
  shadowRoot.appendChild(style);

  const rootContainer = targetDocument.createElement("div");
  rootContainer.className = OVERLAY_ROOT_CLASS;
  shadowRoot.appendChild(rootContainer);

  const mountTarget = targetDocument.documentElement ?? targetDocument.body;
  mountTarget.appendChild(host);

  return {
    host,
    shadowRoot,
    unmount: () => {
      host.remove();
    },
  };
}

/**
 * Query whether a given element is part of the overlay (the host or anything
 * inside its shadow root).
 */
export function isOverlayElement(element: Element, overlayHost: HTMLElement): boolean {
  return element === overlayHost || overlayHost.shadowRoot?.contains(element) === true;
}
