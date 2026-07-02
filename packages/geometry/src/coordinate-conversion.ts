import { add, type Point, subtract } from "./point.js";

/**
 * Pure scroll-coordinate conversions. This module NEVER reads `window.scrollY`
 * or any DOM global — the caller passes the scroll offset explicitly, which
 * keeps the package DOM-free and testable in Node.
 *
 * Coordinate-space model (PRD §11):
 * - **client** — relative to the visible viewport's top-left corner. Stable
 *   across scrolling (matches `getBoundingClientRect()`). What the overlay
 *   paints in.
 * - **viewport / page** — relative to the document's top-left. Shifts by the
 *   accumulated scroll offset. In our model "viewport" and "page" coincide
 *   (both equal client + scrollOffset); the two function names exist because
 *   callers reason about different frames (overlay uses client, source
 *   mapping uses page).
 *
 * `scrollOffset` is the accumulated scroll of all scroll parents from the
 * document root to the element's containing block (see scroll-parents.ts).
 */

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
 * (Page and viewport coincide in this model; provided as a distinct name for
 * callers that reason in page coordinates.)
 */
export const pageToClient = (pagePoint: Point, scrollOffset: Point): Point =>
  subtract(pagePoint, scrollOffset);
