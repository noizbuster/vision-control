import type { Rect } from "@vision-control/geometry";

import type { ResizeHandlePosition, ResizeHandles } from "./resize-handles.js";

export const FLEX_PAIR_FEEDBACK_KINDS = ["valid", "active", "disabled-edge", "blocked"] as const;

export type FlexPairFeedbackKind = (typeof FLEX_PAIR_FEEDBACK_KINDS)[number];

export interface FlexPairFeedbackState {
  readonly kind: FlexPairFeedbackKind;
  readonly anchorRect: Rect;
  readonly pairRect: Rect | null;
  readonly label: string;
  readonly disabledHandles: readonly ResizeHandlePosition[];
}

export interface FlexPairFeedback {
  readonly set: (state: FlexPairFeedbackState) => void;
  readonly clear: () => void;
}

const LABEL_VIEWPORT_INSET_PX = 4;

export function createFlexPairFeedback(
  container: HTMLElement,
  handles: ResizeHandles,
): FlexPairFeedback {
  const document = container.ownerDocument;
  const outline = document.createElement("div");
  outline.className = "vc-flex-pair-outline";
  outline.setAttribute("aria-hidden", "true");
  outline.style.display = "none";

  const label = document.createElement("div");
  label.className = "vc-flex-pair-label";
  label.setAttribute("aria-hidden", "true");
  label.style.display = "none";

  container.append(outline, label);
  let disabledHandles: readonly ResizeHandlePosition[] = [];

  const clear = (): void => {
    for (const handle of disabledHandles) {
      handles.setHandleDisabled(handle, false);
    }
    disabledHandles = [];
    outline.style.display = "none";
    label.style.display = "none";
    label.replaceChildren();
  };

  const set = (state: FlexPairFeedbackState): void => {
    clear();
    const rect = state.pairRect ?? state.anchorRect;
    outline.className = `vc-flex-pair-outline vc-flex-pair-outline--${state.kind}`;
    label.className = `vc-flex-pair-label vc-flex-pair-label--${state.kind}`;
    outline.style.display = "block";
    outline.style.left = `${rect.x}px`;
    outline.style.top = `${rect.y}px`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;

    label.textContent = state.label;
    label.style.display = "inline-flex";
    label.style.top = `${state.anchorRect.y}px`;
    const viewportWidth = document.documentElement.clientWidth;
    label.style.maxWidth = `calc(${viewportWidth}px - var(--vc-space-2))`;
    const labelWidth = label.getBoundingClientRect().width;
    const left = Math.floor(
      Math.max(
        0,
        Math.min(state.anchorRect.x, viewportWidth - LABEL_VIEWPORT_INSET_PX - labelWidth),
      ),
    );
    label.style.left = `${left}px`;

    disabledHandles = state.disabledHandles;
    for (const handle of disabledHandles) {
      handles.setHandleDisabled(handle, true);
    }
  };

  return { set, clear };
}
