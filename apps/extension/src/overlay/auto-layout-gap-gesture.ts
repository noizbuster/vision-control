/**
 * Gap drag gesture between flex/grid children.
 *
 * Places a handle between the first two children; pointer drag adjusts gap in
 * px and commits via the provided callback on pointerup. Fail-closed when the
 * container has fewer than two element children.
 */

export interface GapGestureOptions {
  readonly document: Document;
  readonly container: Element;
  readonly host: HTMLElement;
  readonly initialGapPx: number;
  readonly onPreview: (gapPx: number) => void;
  readonly onCommit: (gapPx: number) => void;
}

export interface GapGesture {
  readonly dispose: () => void;
}

const HANDLE_CLASS = "vc-auto-layout-gap-handle";

function elementChildren(container: Element): readonly Element[] {
  return Array.from(container.children).filter((child) => child.nodeType === 1);
}

function parseGapPx(value: string): number {
  const match = value.trim().match(/^(-?\d*\.?\d+)px$/i);
  if (match === null || match[1] === undefined) return 0;
  const n = Number.parseFloat(match[1]);
  return Number.isFinite(n) ? n : 0;
}

/** Read computed gap as px (falls back to 0). */
export function readGapPx(computed: CSSStyleDeclaration): number {
  const gap = computed.gap || computed.columnGap || computed.rowGap || "0px";
  return parseGapPx(gap);
}

export function attachGapGesture(options: GapGestureOptions): GapGesture | null {
  const { document: doc, container, host, initialGapPx, onPreview, onCommit } = options;
  const children = elementChildren(container);
  if (children.length < 2) return null;

  const first = children[0];
  const second = children[1];
  if (first === undefined || second === undefined) return null;

  const handle = doc.createElement("div");
  handle.className = HANDLE_CLASS;
  handle.setAttribute("data-testid", "auto-layout-overlay-gap-handle");
  handle.setAttribute("aria-label", "Drag to adjust gap");
  handle.style.pointerEvents = "auto";
  host.appendChild(handle);

  const positionHandle = (): void => {
    const a = first.getBoundingClientRect();
    const b = second.getBoundingClientRect();
    const midX = (a.right + b.left) / 2;
    const midY = (Math.min(a.top, b.top) + Math.max(a.bottom, b.bottom)) / 2;
    const horizontal = Math.abs(b.left - a.right) >= Math.abs(b.top - a.bottom);
    handle.style.left = `${midX - 6}px`;
    handle.style.top = `${midY - 6}px`;
    handle.dataset.axis = horizontal ? "horizontal" : "vertical";
  };
  positionHandle();

  let drag: {
    readonly pointerId: number;
    readonly startClient: number;
    readonly startGap: number;
    readonly axis: "horizontal" | "vertical";
  } | null = null;
  let latestGap = initialGapPx;

  const onPointerMove = (event: PointerEvent): void => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const delta =
      drag.axis === "horizontal"
        ? event.clientX - drag.startClient
        : event.clientY - drag.startClient;
    latestGap = Math.max(0, Math.round(drag.startGap + delta));
    onPreview(latestGap);
    event.preventDefault();
    event.stopPropagation();
  };

  const endDrag = (event: PointerEvent | null): void => {
    if (drag === null) return;
    const ownerWindow = doc.defaultView;
    ownerWindow?.removeEventListener("pointermove", onPointerMove);
    ownerWindow?.removeEventListener("pointerup", onPointerUp);
    ownerWindow?.removeEventListener("pointercancel", onPointerUp);
    if (
      typeof handle.hasPointerCapture === "function" &&
      handle.hasPointerCapture(drag.pointerId)
    ) {
      handle.releasePointerCapture(drag.pointerId);
    }
    onCommit(latestGap);
    drag = null;
    if (event !== null) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    endDrag(event);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const ownerWindow = doc.defaultView;
    if (ownerWindow === null) return;
    const axis = handle.dataset.axis === "vertical" ? "vertical" : "horizontal";
    drag = {
      pointerId: event.pointerId,
      startClient: axis === "horizontal" ? event.clientX : event.clientY,
      startGap: latestGap,
      axis,
    };
    if (typeof handle.setPointerCapture === "function") {
      handle.setPointerCapture(event.pointerId);
    }
    ownerWindow.addEventListener("pointermove", onPointerMove);
    ownerWindow.addEventListener("pointerup", onPointerUp);
    ownerWindow.addEventListener("pointercancel", onPointerUp);
    event.preventDefault();
    event.stopPropagation();
  };

  handle.addEventListener("pointerdown", onPointerDown);

  return {
    dispose: () => {
      handle.removeEventListener("pointerdown", onPointerDown);
      endDrag(null);
      handle.remove();
    },
  };
}
