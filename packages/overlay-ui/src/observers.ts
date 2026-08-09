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

    const ancestors = getScrollableAncestors(element);
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
 * Walks composed ancestors and returns scrollable elements, then the owner
 * window only when the path reaches the owning document. Closed shadow roots
 * deliberately stop the walk at their local boundary.
 */
export function getScrollableAncestors(
  element: Element,
  options: { readonly includeSelf?: boolean } = {},
): readonly (Element | Window)[] {
  const ancestors: Array<Element | Window> = [];
  const ownerWindow = element.ownerDocument.defaultView ?? window;
  let current: Element | null = options.includeSelf === true ? element : element.parentElement;
  let reachedDocument = false;

  while (current !== null) {
    const style = ownerWindow.getComputedStyle(current);
    if (
      isScrollContainer(style.overflow) ||
      isScrollContainer(style.overflowX) ||
      isScrollContainer(style.overflowY)
    ) {
      ancestors.push(current);
    }

    if (current.parentElement !== null) {
      current = current.parentElement;
      continue;
    }
    const root = current.getRootNode();
    if (root instanceof ShadowRoot) {
      if (root.mode === "closed") break;
      current = root.host;
      continue;
    }
    reachedDocument = root instanceof Document;
    break;
  }

  if (reachedDocument) ancestors.push(ownerWindow);
  return ancestors;
}

function isScrollContainer(overflow: string): boolean {
  return overflow === "auto" || overflow === "scroll";
}
