/**
 * Marquee drag-rectangle controller (plan task 2).
 *
 * Owns the rubber-band selection gesture: a pointer-down in empty space starts
 * the drag, pointer-move drives {@link createMarqueeOverlay}'s rectangle via
 * pointer capture, and pointer-up hit-tests the rectangle with
 * {@link elementsFromRect} (excluding the overlay and the page background) and
 * hands the intersected elements to the runtime via `onComplete`.
 *
 * Selection only (PRD constraint 2 / Appendix D.2): no positioning is triggered.
 * The runtime is notified so it can route the result into the multi-select
 * controller; this module never records an edit.
 */

import type { Rect } from "@vision-control/geometry";
import {
  createMarqueeOverlay,
  elementsFromRect,
  type MarqueeOverlay,
} from "@vision-control/overlay-ui";

/** Minimum movement (px) for a drag to count as a marquee, not a plain click. */
const MARQUEE_MIN_DRAG = 4;

export interface MarqueeControllerOptions {
  readonly document: Document;
  readonly overlayHost: HTMLElement;
  readonly shadowRoot: ShadowRoot;
  /** Invoked with the intersected page elements when a marquee gesture ends. */
  readonly onComplete: (elements: readonly Element[]) => void;
}

export interface MarqueeController {
  readonly attach: () => void;
  readonly detach: () => void;
  /**
   * Returns true once if the just-completed gesture was a marquee (so the
   * caller can swallow the synthetic click that follows), then resets.
   */
  readonly consumeCompletedGesture: () => boolean;
}

export function createMarqueeController(options: MarqueeControllerOptions): MarqueeController {
  const { document: doc, overlayHost, shadowRoot, onComplete } = options;
  const marquee: MarqueeOverlay = createMarqueeOverlay(shadowRoot);

  let active = false;
  let pointerId: number | null = null;
  let start: { readonly x: number; readonly y: number } | null = null;
  let justCompleted = false;

  const isEmptySpace = (target: Element | null): boolean =>
    target !== null && (target === doc.body || target === doc.documentElement);

  const onPointerDown = (event: PointerEvent): void => {
    justCompleted = false;
    if (event.shiftKey || event.button !== 0) return;
    const target = event.target as Element | null;
    if (!isEmptySpace(target)) return;
    event.preventDefault();
    active = true;
    pointerId = event.pointerId;
    start = { x: event.clientX, y: event.clientY };
    marquee.showMarquee(start);
    const captureTarget = target as Element & {
      setPointerCapture?: (id: number) => void;
    };
    if (typeof captureTarget.setPointerCapture === "function") {
      captureTarget.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!active) return;
    if (pointerId !== null && event.pointerId !== pointerId) return;
    marquee.updateMarquee({ x: event.clientX, y: event.clientY });
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!active) return;
    active = false;
    pointerId = null;
    const begin = start;
    start = null;
    const rect: Rect | null = marquee.getRect();
    marquee.hideMarquee();
    const releaseTarget = event.target as Element & {
      releasePointerCapture?: (id: number) => void;
    };
    if (typeof releaseTarget.releasePointerCapture === "function") {
      releaseTarget.releasePointerCapture(event.pointerId);
    }
    if (begin === null || rect === null) return;
    if (rect.width < MARQUEE_MIN_DRAG || rect.height < MARQUEE_MIN_DRAG) return;
    justCompleted = true;
    const hits = elementsFromRect(rect, overlayHost).filter(
      (element) => element !== doc.body && element !== doc.documentElement,
    );
    onComplete(hits);
  };

  const attach = (): void => {
    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("pointermove", onPointerMove, true);
    doc.addEventListener("pointerup", onPointerUp, true);
  };

  const detach = (): void => {
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("pointermove", onPointerMove, true);
    doc.removeEventListener("pointerup", onPointerUp, true);
  };

  const consumeCompletedGesture = (): boolean => {
    const value = justCompleted;
    justCompleted = false;
    return value;
  };

  return { attach, detach, consumeCompletedGesture };
}
