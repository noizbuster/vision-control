import { applyToPoint, invert, type Matrix2D } from "./matrix.js";
import { add, type Point, subtract } from "./point.js";

/**
 * Pure scroll/transform coordinate conversions. This module NEVER reads
 * `window.scrollY`, `window.devicePixelRatio`, or any DOM global — the caller
 * passes every offset, ratio, and matrix explicitly, which keeps the package
 * DOM-free and testable in Node.
 *
 * Coordinate systems (PRD §11), seven in total. Each is a distinct frame
 * callers reason about; the math for translation-only frames reduces to the
 * same add/subtract, but the names stay distinct so call sites read in the
 * frame the caller is thinking in (the same precedent set by
 * `clientToViewport` / `pageToClient`):
 *
 * 1. **client** — relative to the visible viewport's top-left corner. The
 *    space `getBoundingClientRect()` returns and the overlay paints in.
 * 2. **viewport** — client + accumulated scroll offset (document-relative).
 *    `viewport = client + scrollOffset`.
 * 3. **page** — the document-relative frame, distinct from viewport by caller
 *    intent even though the scroll model gives them the same numeric value
 *    here. `pageToClient` exists as a separate name for source-mapping callers.
 * 4. **frame-local** — relative to a same-origin iframe's origin (the iframe
 *    element's border-box top-left in the parent document's client space). See
 *    {@link clientToFrameLocal}.
 * 5. **offsetParent** — relative to the element's offsetParent border-box
 *    origin (matches `HTMLElement.offsetLeft`/`offsetTop` semantics). See
 *    {@link clientToOffsetParent}.
 * 6. **transformed-local** — the element's own local coordinate system under a
 *    composed CSS transform + `transform-origin`. Handles transformed
 *    ancestors via `DOMMatrix`/`Matrix2D`. See {@link clientToLocal}.
 * 7. **device-pixel** — physical screen pixels for screenshot alignment.
 *    `device = css * devicePixelRatio`. See {@link cssToDevicePixel}.
 *
 * `scrollOffset` (for systems 2/3) is the accumulated scroll of all scroll
 * parents from the document root to the element's containing block
 * (see scroll-parents.ts).
 */

// ---------------------------------------------------------------------------
// client / viewport / page  (scroll-offset frames — systems 1-3)
// ---------------------------------------------------------------------------

/**
 * client -> viewport (document) coordinates: add the scroll offset.
 * `viewport = client + scrollOffset`.
 */
export const clientToViewport = (clientPoint: Point, scrollOffset: Point): Point =>
  add(clientPoint, scrollOffset);

/**
 * viewport (document) -> client coordinates: subtract the scroll offset.
 * `client = viewport - scrollOffset`. Inverse of {@link clientToViewport}.
 */
export const viewportToClient = (viewportPoint: Point, scrollOffset: Point): Point =>
  subtract(viewportPoint, scrollOffset);

/**
 * page -> client coordinates: `client = page - scrollOffset`.
 * (Page and viewport coincide in this model's scroll math; provided as a
 * distinct name for callers that reason in page coordinates.)
 */
export const pageToClient = (pagePoint: Point, scrollOffset: Point): Point =>
  subtract(pagePoint, scrollOffset);

// ---------------------------------------------------------------------------
// frame-local  (same-origin iframe — system 4)
// ---------------------------------------------------------------------------

/**
 * client -> frame-local coordinates for a same-origin iframe. `iframeOrigin`
 * is the iframe element's border-box top-left in the parent document's client
 * space (the browser adapter derives it from `getBoundingClientRect()`). A
 * pointer at the iframe's top-left corner maps to `{0,0}` inside the frame.
 * `frameLocal = client - iframeOrigin`.
 */
export const clientToFrameLocal = (clientPoint: Point, iframeOrigin: Point): Point =>
  subtract(clientPoint, iframeOrigin);

/**
 * frame-local -> client coordinates. Inverse of {@link clientToFrameLocal}.
 * `client = frameLocal + iframeOrigin`.
 */
export const frameLocalToClient = (frameLocalPoint: Point, iframeOrigin: Point): Point =>
  add(frameLocalPoint, iframeOrigin);

// ---------------------------------------------------------------------------
// offsetParent  (system 5)
// ---------------------------------------------------------------------------

/**
 * client -> offsetParent coordinates. `offsetParentOrigin` is the offsetParent's
 * border-box top-left in client space, so the result matches
 * `HTMLElement.offsetLeft`/`offsetTop` semantics (coordinates relative to the
 * containing offsetParent). `offsetParentLocal = client - offsetParentOrigin`.
 */
export const clientToOffsetParent = (clientPoint: Point, offsetParentOrigin: Point): Point =>
  subtract(clientPoint, offsetParentOrigin);

/**
 * offsetParent -> client coordinates. Inverse of {@link clientToOffsetParent}.
 * `client = offsetParentLocal + offsetParentOrigin`.
 */
export const offsetParentToClient = (offsetParentPoint: Point, offsetParentOrigin: Point): Point =>
  add(offsetParentPoint, offsetParentOrigin);

// ---------------------------------------------------------------------------
// transformed-local  (CSS-transformed ancestor chain — system 6)
// ---------------------------------------------------------------------------

/**
 * client -> element-local coordinates under a CSS transform. `transform` is the
 * composed 2D affine matrix of the element and its transformed-ancestor chain;
 * `transformOrigin` is the CSS `transform-origin` pivot in element-local
 * coordinates. The pivot means:
 *   `local = origin + M^-1 * (client - origin)`.
 * Returns `undefined` when `transform` is singular (degenerate scale or zero
 * determinant); the caller should treat that as an unresolvable transform.
 */
export const clientToLocal = (
  clientPoint: Point,
  transform: Matrix2D,
  transformOrigin: Point,
): Point | undefined => {
  const inverse = invert(transform);
  if (inverse === undefined) return undefined;
  return add(transformOrigin, applyToPoint(inverse, subtract(clientPoint, transformOrigin)));
};

/**
 * element-local -> client coordinates under a CSS transform. Inverse of
 * {@link clientToLocal}. `client = origin + M * (local - origin)`. Always
 * defined (forward application never fails, even for singular matrices).
 */
export const localToClient = (
  localPoint: Point,
  transform: Matrix2D,
  transformOrigin: Point,
): Point => add(transformOrigin, applyToPoint(transform, subtract(localPoint, transformOrigin)));

// ---------------------------------------------------------------------------
// device-pixel  (screenshots — system 7)
// ---------------------------------------------------------------------------

/**
 * CSS-pixel -> device-pixel coordinates. `devicePixelRatio` is
 * `window.devicePixelRatio` at capture time (1 on standard displays, 2+ on
 * retina). `device = css * devicePixelRatio`. Used to align screenshot crops
 * with the physical pixel buffer.
 */
export const cssToDevicePixel = (cssPoint: Point, devicePixelRatio: number): Point => ({
  x: cssPoint.x * devicePixelRatio,
  y: cssPoint.y * devicePixelRatio,
});

/**
 * device-pixel -> CSS-pixel coordinates. Inverse of {@link cssToDevicePixel}.
 * `css = device / devicePixelRatio`.
 */
export const devicePixelToCss = (devicePoint: Point, devicePixelRatio: number): Point => ({
  x: devicePoint.x / devicePixelRatio,
  y: devicePoint.y / devicePixelRatio,
});
