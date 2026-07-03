/**
 * Rotation handle (PRD §8.2).
 *
 * Present in the overlay DOM but INTENTIONALLY NON-INTERACTIVE for the MVP.
 * PRD §8.2 states "rotation handle은 초기 비활성". The handle carries
 * `aria-disabled`, a `data-disabled` attribute, and `pointer-events: none` so
 * it can never start a drag. It is a placeholder for a future V1 feature.
 */

import type { Rect } from "@vision-control/geometry";

export interface RotationHandle {
  readonly show: (rect: Rect) => void;
  readonly clear: () => void;
}

const STEM_LENGTH = 16;
const HANDLE_RADIUS = 5;

export function createRotationHandle(container: HTMLElement): RotationHandle {
  const document = container.ownerDocument;

  const stem = document.createElement("div");
  stem.className = "vc-rotation-handle__stem";
  stem.style.display = "none";
  stem.style.pointerEvents = "none";
  stem.setAttribute("aria-hidden", "true");

  const handle = document.createElement("div");
  handle.className = "vc-rotation-handle";
  handle.style.display = "none";
  handle.style.pointerEvents = "none";
  handle.setAttribute("aria-disabled", "true");
  handle.setAttribute("data-disabled", "");
  handle.setAttribute("role", "button");
  handle.setAttribute("aria-label", "Rotation handle (disabled)");
  handle.setAttribute("tabindex", "-1");

  container.appendChild(stem);
  container.appendChild(handle);

  const show = (rect: Rect): void => {
    const topX = rect.x + rect.width / 2;
    const topY = rect.y;
    const stemTop = topY - STEM_LENGTH;
    const handleCx = topX;
    const handleCy = stemTop - HANDLE_RADIUS;

    stem.style.display = "block";
    stem.style.left = `${topX - 0.5}px`;
    stem.style.top = `${stemTop}px`;
    stem.style.width = "1px";
    stem.style.height = `${STEM_LENGTH}px`;

    handle.style.display = "block";
    handle.style.left = `${handleCx - HANDLE_RADIUS}px`;
    handle.style.top = `${handleCy - HANDLE_RADIUS}px`;
    handle.style.width = `${HANDLE_RADIUS * 2}px`;
    handle.style.height = `${HANDLE_RADIUS * 2}px`;
  };

  const clear = (): void => {
    stem.style.display = "none";
    handle.style.display = "none";
  };

  return { show, clear };
}
