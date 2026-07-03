/**
 * Flex/grid main-axis indicator (PRD §8.2).
 *
 * Draws a directional line through the container showing the main-axis the
 * children flow along (flex row → horizontal arrow, flex column → vertical
 * arrow, grid → crosshair). Advisory only; no pointer capture.
 */

import type { Point, Rect } from "@vision-control/geometry";

export type AxisContainerKind = "flex" | "grid";

export type AxisDirection = "horizontal" | "vertical";

export interface FlexGridAxisState {
  readonly rect: Rect;
  readonly kind: AxisContainerKind;
  readonly direction: AxisDirection;
}

export interface FlexGridAxis {
  readonly setAxis: (state: FlexGridAxisState | null) => void;
  readonly clear: () => void;
}

const ARROW_HALF = 5;
const LINE_THICKNESS = 2;

export function createFlexGridAxis(container: HTMLElement): FlexGridAxis {
  const document = container.ownerDocument;
  const indicator = document.createElement("div");
  indicator.className = "vc-axis-indicator";
  indicator.style.display = "none";
  indicator.style.pointerEvents = "none";
  container.appendChild(indicator);

  const line = document.createElement("div");
  line.className = "vc-axis-indicator__line";
  line.style.pointerEvents = "none";
  const head = document.createElement("div");
  head.className = "vc-axis-indicator__arrow";
  head.style.pointerEvents = "none";
  const tail = document.createElement("div");
  tail.className = "vc-axis-indicator__arrow";
  tail.style.pointerEvents = "none";

  indicator.appendChild(line);
  indicator.appendChild(head);
  indicator.appendChild(tail);

  const positionArrow = (
    el: HTMLElement,
    anchor: Point,
    direction: AxisDirection,
    flip: boolean,
  ): void => {
    el.style.display = "block";
    if (direction === "horizontal") {
      const x = flip ? anchor.x - ARROW_HALF : anchor.x + ARROW_HALF;
      el.style.left = `${x}px`;
      el.style.top = `${anchor.y - ARROW_HALF}px`;
      el.style.borderTop = `${ARROW_HALF}px solid transparent`;
      el.style.borderBottom = `${ARROW_HALF}px solid transparent`;
      el.style.borderLeft = flip ? "none" : `${ARROW_HALF}px solid var(--vc-axis-flex)`;
      el.style.borderRight = flip ? `${ARROW_HALF}px solid var(--vc-axis-grid)` : "none";
    } else {
      const y = flip ? anchor.y - ARROW_HALF : anchor.y + ARROW_HALF;
      el.style.left = `${anchor.x - ARROW_HALF}px`;
      el.style.top = `${y}px`;
      el.style.borderLeft = `${ARROW_HALF}px solid transparent`;
      el.style.borderRight = `${ARROW_HALF}px solid transparent`;
      el.style.borderTop = flip ? "none" : `${ARROW_HALF}px solid var(--vc-axis-flex)`;
      el.style.borderBottom = flip ? `${ARROW_HALF}px solid var(--vc-axis-grid)` : "none";
    }
  };

  const setAxis = (state: FlexGridAxisState | null): void => {
    if (state === null) {
      indicator.style.display = "none";
      return;
    }
    const { rect, kind, direction } = state;
    indicator.className = `vc-axis-indicator vc-axis-indicator--${kind}`;
    indicator.style.display = "block";
    indicator.style.left = `${rect.x}px`;
    indicator.style.top = `${rect.y}px`;
    indicator.style.width = `${rect.width}px`;
    indicator.style.height = `${rect.height}px`;

    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    if (direction === "horizontal") {
      line.style.left = `${rect.x}px`;
      line.style.top = `${cy - LINE_THICKNESS / 2}px`;
      line.style.width = `${rect.width}px`;
      line.style.height = `${LINE_THICKNESS}px`;
      positionArrow(head, { x: rect.x + rect.width, y: cy }, direction, false);
      positionArrow(tail, { x: rect.x, y: cy }, direction, true);
    } else {
      line.style.left = `${cx - LINE_THICKNESS / 2}px`;
      line.style.top = `${rect.y}px`;
      line.style.width = `${LINE_THICKNESS}px`;
      line.style.height = `${rect.height}px`;
      positionArrow(head, { x: cx, y: rect.y + rect.height }, direction, false);
      positionArrow(tail, { x: cx, y: rect.y }, direction, true);
    }
  };

  const clear = (): void => {
    indicator.style.display = "none";
  };

  return { setAxis, clear };
}
