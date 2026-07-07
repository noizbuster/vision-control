interface DraggableFixedPanelOptions {
  readonly panel: HTMLElement;
  readonly handle: HTMLElement;
  readonly draggingClassName: string;
}

interface DraggableFixedPanel {
  readonly dispose: () => void;
}

interface DragState {
  readonly pointerId: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly window: Window;
}

interface PanelPosition {
  readonly x: number;
  readonly y: number;
}

const VIEWPORT_MARGIN = 4;

export function makeDraggableFixedPanel(options: DraggableFixedPanelOptions): DraggableFixedPanel {
  const { panel, handle, draggingClassName } = options;
  let dragState: DragState | null = null;

  const stopDrag = (event: PointerEvent | null): void => {
    const state = dragState;
    if (state === null) return;
    state.window.removeEventListener("pointermove", onPointerMove);
    state.window.removeEventListener("pointerup", onPointerEnd);
    state.window.removeEventListener("pointercancel", onPointerEnd);
    releasePointer(handle, state.pointerId);
    handle.classList.remove(draggingClassName);
    dragState = null;
    if (event !== null) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const ownerWindow = panel.ownerDocument.defaultView;
    if (ownerWindow === null) return;
    const rect = panel.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.x,
      offsetY: event.clientY - rect.y,
      window: ownerWindow,
    };
    capturePointer(handle, event.pointerId);
    handle.classList.add(draggingClassName);
    ownerWindow.addEventListener("pointermove", onPointerMove);
    ownerWindow.addEventListener("pointerup", onPointerEnd);
    ownerWindow.addEventListener("pointercancel", onPointerEnd);
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerMove = (event: PointerEvent): void => {
    const state = dragState;
    if (state === null || event.pointerId !== state.pointerId) return;
    const next = clampPanelPosition(panel, {
      x: event.clientX - state.offsetX,
      y: event.clientY - state.offsetY,
    });
    applyPanelPosition(panel, next);
    event.preventDefault();
    event.stopPropagation();
  };

  const onPointerEnd = (event: PointerEvent): void => {
    const state = dragState;
    if (state === null || event.pointerId !== state.pointerId) return;
    stopDrag(event);
  };

  handle.addEventListener("pointerdown", onPointerDown);

  return {
    dispose: () => {
      handle.removeEventListener("pointerdown", onPointerDown);
      stopDrag(null);
    },
  };
}

function applyPanelPosition(panel: HTMLElement, position: PanelPosition): void {
  panel.style.left = `${Math.round(position.x)}px`;
  panel.style.top = `${Math.round(position.y)}px`;
  panel.style.right = "auto";
}

function clampPanelPosition(panel: HTMLElement, position: PanelPosition): PanelPosition {
  const ownerWindow = panel.ownerDocument.defaultView;
  if (ownerWindow === null) return position;
  const rect = panel.getBoundingClientRect();
  const panelWidth = rect.width > 0 ? rect.width : panel.offsetWidth;
  const panelHeight = rect.height > 0 ? rect.height : panel.offsetHeight;
  const maxX = Math.max(VIEWPORT_MARGIN, ownerWindow.innerWidth - panelWidth - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, ownerWindow.innerHeight - panelHeight - VIEWPORT_MARGIN);
  return {
    x: clamp(position.x, VIEWPORT_MARGIN, maxX),
    y: clamp(position.y, VIEWPORT_MARGIN, maxY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function capturePointer(element: HTMLElement, pointerId: number): void {
  if (typeof element.setPointerCapture !== "function") return;
  element.setPointerCapture(pointerId);
}

function releasePointer(element: HTMLElement, pointerId: number): void {
  if (typeof element.hasPointerCapture !== "function") return;
  if (!element.hasPointerCapture(pointerId)) return;
  element.releasePointerCapture(pointerId);
}
