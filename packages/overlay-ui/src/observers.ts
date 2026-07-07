/**
 * Scroll, resize, and visibility observers for overlay positioning.
 *
 * Watches the selected element for geometry changes and notifies a callback so
 * the overlay can be re-positioned. Uses `ResizeObserver` for element size
 * changes, scroll listeners on scrollable ancestors, and `IntersectionObserver`
 * to detect when the element leaves the viewport.
 */

export interface PositionObserverCallbacks {
  /** Called whenever the target's position or size may have changed. */
  readonly onChange: () => void;
  /** Called when the target becomes fully hidden from view. */
  readonly onHidden?: () => void;
  /** Called when the target becomes visible again. */
  readonly onVisible?: () => void;
}

/** API returned by {@link createPositionObserver}. */
export interface PositionObserver {
  /** Start observing a target element. Disconnects any previous target. */
  readonly observe: (target: Element) => void;
  /** Stop all observers and scroll listeners. */
  readonly disconnect: () => void;
}

/**
 * Create an observer that tracks an element's client-rect stability.
 *
 * The callback is invoked on:
 * - element resize (ResizeObserver)
 * - scroll of any scrollable ancestor
 * - document capture scroll
 * - window resize
 * - visibility changes (IntersectionObserver)
 */
export function createPositionObserver(callbacks: PositionObserverCallbacks): PositionObserver {
  const { onChange, onHidden, onVisible } = callbacks;
  let target: Element | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  const scrollListeners: Array<{
    readonly element: EventTarget;
    readonly listener: EventListener;
    readonly capture: boolean;
  }> = [];

  const notifyChange = (): void => {
    onChange();
  };

  const handleIntersection: IntersectionObserverCallback = (entries) => {
    const [entry] = entries;
    if (entry === undefined) return;
    onChange();
    if (entry.isIntersecting) {
      onVisible?.();
    } else if (entry.intersectionRatio === 0) {
      onHidden?.();
    }
  };

  const attachScrollListeners = (element: Element): void => {
    const documentListener = (): void => notifyChange();
    element.ownerDocument.addEventListener("scroll", documentListener, {
      capture: true,
      passive: true,
    });
    scrollListeners.push({
      element: element.ownerDocument,
      listener: documentListener,
      capture: true,
    });

    const ancestors = collectScrollAncestors(element);
    for (const ancestor of ancestors) {
      const listener = (): void => notifyChange();
      ancestor.addEventListener("scroll", listener, { passive: true });
      scrollListeners.push({ element: ancestor, listener, capture: false });
    }
  };

  const disconnectScrollListeners = (): void => {
    for (const { element, listener, capture } of scrollListeners) {
      element.removeEventListener("scroll", listener, { capture });
    }
    scrollListeners.length = 0;
  };

  const observe = (nextTarget: Element): void => {
    disconnect();
    target = nextTarget;

    resizeObserver = new ResizeObserver(notifyChange);
    resizeObserver.observe(target);

    intersectionObserver = new IntersectionObserver(handleIntersection, {
      threshold: [0, 0.01, 1],
    });
    intersectionObserver.observe(target);

    attachScrollListeners(target);
    window.addEventListener("resize", notifyChange);
  };

  const disconnect = (): void => {
    target = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    intersectionObserver?.disconnect();
    intersectionObserver = null;
    disconnectScrollListeners();
    window.removeEventListener("resize", notifyChange);
  };

  return { observe, disconnect };
}

/**
 * Walk up from `element` and collect every scrollable ancestor, plus the owner
 * window. Document capture scroll is attached separately above.
 */
function collectScrollAncestors(element: Element): readonly EventTarget[] {
  const ancestors: EventTarget[] = [];
  const ownerWindow = element.ownerDocument.defaultView ?? window;
  let current: Element | null = element.parentElement;

  while (current !== null) {
    const style = ownerWindow.getComputedStyle(current);
    if (
      isScrollContainer(style.overflow) ||
      isScrollContainer(style.overflowX) ||
      isScrollContainer(style.overflowY)
    ) {
      ancestors.push(current);
    }
    current = current.parentElement;
  }

  ancestors.push(ownerWindow);
  return ancestors;
}

function isScrollContainer(overflow: string): boolean {
  return overflow === "auto" || overflow === "scroll";
}
