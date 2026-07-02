/**
 * Same-origin iframe coordinate bridge.
 *
 * Converts a client rect that lives inside a nested frame into the coordinate
 * space of the top-level document so the overlay can draw over it. Cross-origin
 * frames are opaque and reported as such.
 */

import type { Rect } from "@vision-control/geometry";

/** Error indicating a frame cannot be bridged because it is cross-origin. */
export class OpaqueFrameError extends Error {
  override readonly name = "OpaqueFrameError";
  constructor(readonly frameElement: Element) {
    super("cannot bridge coordinates across a cross-origin iframe");
  }
}

/** Result of attempting to bridge a rect to top-frame coordinates. */
export type BridgedRectResult =
  | { readonly ok: true; readonly value: Rect }
  | { readonly ok: false; readonly error: OpaqueFrameError };

/**
 * Convert a DOMRect measured in a possibly-nested frame into top-frame client
 * coordinates.
 *
 * Walks up through `ownerDocument.defaultView.frameElement`, adding each
 * iframe's client offset. Stops and returns an `OpaqueFrameError` if a
 * cross-origin iframe is encountered.
 */
export function bridgeRectToTopFrame(rect: DOMRect, target: Element): BridgedRectResult {
  let offsetX = 0;
  let offsetY = 0;
  let currentDocument: Document | null = target.ownerDocument;

  while (currentDocument !== null) {
    const win = currentDocument.defaultView;
    if (win === null) break;

    const frameElement = win.frameElement;
    if (frameElement === null) break;

    const iframeRect = frameElement.getBoundingClientRect();
    const contentDocument = getContentDocument(frameElement);
    if (contentDocument === null) {
      return { ok: false, error: new OpaqueFrameError(frameElement) };
    }

    offsetX += iframeRect.x;
    offsetY += iframeRect.y;
    currentDocument = contentDocument;
  }

  const bridged: Rect = {
    x: rect.x + offsetX,
    y: rect.y + offsetY,
    width: rect.width,
    height: rect.height,
  };
  return { ok: true, value: bridged };
}

/**
 * Safely read an iframe's content document. Returns `null` for cross-origin
 * frames (or frames that are not ready), which is the signal that the frame is
 * opaque.
 */
function getContentDocument(frameElement: Element): Document | null {
  if (!(frameElement instanceof HTMLIFrameElement)) {
    return null;
  }
  try {
    return frameElement.contentDocument;
  } catch {
    return null;
  }
}
