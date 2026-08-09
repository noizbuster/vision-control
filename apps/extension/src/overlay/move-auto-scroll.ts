import { getScrollableAncestors } from "@vision-control/overlay-ui";

export interface MoveAutoScrollUpdate {
  readonly point: { readonly x: number; readonly y: number };
  readonly scrollAnchor: Element | null;
  readonly windowFallback: boolean;
}

export interface MoveAutoScroller {
  readonly update: (update: MoveAutoScrollUpdate) => void;
  readonly stop: () => void;
  readonly dispose: () => void;
}

export interface MoveAutoScrollerOptions {
  readonly document: Document;
  readonly getScrollableAncestors?: typeof getScrollableAncestors;
  readonly onScrollFrame: () => void;
}

const EDGE_PX = 48;
const MAX_SPEED_PX = 24;

const edgeDelta = (position: number, start: number, end: number): number => {
  if (position < start + EDGE_PX) return -((start + EDGE_PX - position) / EDGE_PX) * MAX_SPEED_PX;
  if (position > end - EDGE_PX) return ((position - (end - EDGE_PX)) / EDGE_PX) * MAX_SPEED_PX;
  return 0;
};

const scrollElement = (element: Element, point: MoveAutoScrollUpdate["point"]): boolean => {
  const rect = element.getBoundingClientRect();
  const x = edgeDelta(point.x, rect.left, rect.right);
  const y = edgeDelta(point.y, rect.top, rect.bottom);
  const beforeX = element.scrollLeft;
  const beforeY = element.scrollTop;
  if (x !== 0) element.scrollLeft += x;
  if (y !== 0) element.scrollTop += y;
  return element.scrollLeft !== beforeX || element.scrollTop !== beforeY;
};

const scrollWindow = (window: Window, point: MoveAutoScrollUpdate["point"]): boolean => {
  const x = edgeDelta(point.x, 0, window.innerWidth);
  const y = edgeDelta(point.y, 0, window.innerHeight);
  const beforeX = window.scrollX;
  const beforeY = window.scrollY;
  if (x !== 0 || y !== 0) window.scrollBy(x, y);
  return window.scrollX !== beforeX || window.scrollY !== beforeY;
};

/** Scrolls the nearest eligible ancestor while a Move pointer is held near an edge. */
export const createMoveAutoScroller = (options: MoveAutoScrollerOptions): MoveAutoScroller => {
  const scrollableAncestors = options.getScrollableAncestors ?? getScrollableAncestors;
  const ownerWindow = options.document.defaultView;
  let current: MoveAutoScrollUpdate | null = null;
  let frame: number | null = null;
  let disposed = false;

  const run = (): void => {
    frame = null;
    if (disposed || current === null) return;
    const candidates =
      current.scrollAnchor === null
        ? current.windowFallback && ownerWindow !== null
          ? [ownerWindow]
          : []
        : scrollableAncestors(current.scrollAnchor, { includeSelf: true });
    let scrolled = false;
    for (const candidate of candidates) {
      if (candidate instanceof Element)
        scrolled = scrollElement(candidate, current.point) || scrolled;
      else scrolled = scrollWindow(candidate, current.point) || scrolled;
      if (scrolled) break;
    }
    if (!scrolled) return;
    options.onScrollFrame();
    if (current !== null && frame === null)
      frame = (ownerWindow ?? window).requestAnimationFrame(run);
  };

  const start = (): void => {
    if (frame !== null || current === null || disposed) return;
    frame = (ownerWindow ?? window).requestAnimationFrame(run);
  };

  const stop = (): void => {
    current = null;
    if (frame === null) return;
    (ownerWindow ?? window).cancelAnimationFrame(frame);
    frame = null;
  };

  return {
    update: (update): void => {
      current = update;
      start();
    },
    stop,
    dispose: (): void => {
      disposed = true;
      stop();
    },
  };
};
