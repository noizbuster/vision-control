/**
 * Changed-element badge (PRD §8.2, "변경된 요소 badge").
 *
 * A small badge rendered near a modified element signalling it has uncommitted
 * preview/changes. Advisory only; pointer-events: none.
 */

import type { Rect } from "@vision-control/geometry";

export interface ChangedBadgeState {
  readonly rect: Rect;
  readonly label: string;
}

export interface ChangedBadge {
  readonly showChangedBadge: (state: ChangedBadgeState) => void;
  readonly clear: () => void;
}

const BADGE_CLASS = "vc-changed-badge";
const BADGE_OFFSET = 2;

export function createChangedBadge(container: HTMLElement): ChangedBadge {
  const document = container.ownerDocument;
  const badge = document.createElement("div");
  badge.className = BADGE_CLASS;
  badge.style.display = "none";
  badge.style.pointerEvents = "none";
  container.appendChild(badge);

  const showChangedBadge = (state: ChangedBadgeState): void => {
    badge.textContent = state.label;
    badge.style.display = "inline-flex";
    badge.style.left = `${state.rect.x + state.rect.width + BADGE_OFFSET}px`;
    badge.style.top = `${state.rect.y}px`;
  };

  const clear = (): void => {
    badge.style.display = "none";
    badge.replaceChildren();
  };

  return { showChangedBadge, clear };
}
