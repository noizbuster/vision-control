import type { Rect } from "@vision-control/geometry";
import {
  createDropIndicator,
  createDropTargetHighlighter,
  type DropTargetValidity,
} from "@vision-control/overlay-ui";

export interface MoveFeedbackRender {
  readonly targetRect: Rect | null;
  readonly validity: DropTargetValidity;
  readonly warning: string | null;
  readonly indicator: {
    readonly rect: Rect;
    readonly orientation: "horizontal" | "vertical";
  } | null;
}

export interface MoveFeedback {
  readonly render: (state: MoveFeedbackRender) => void;
  readonly clear: () => void;
}

export const createInteractionMoveFeedback = (
  overlayRoot: ShadowRoot,
  overlayContainer: HTMLElement,
): MoveFeedback => {
  const highlighter = createDropTargetHighlighter(overlayRoot);
  const dropIndicator = createDropIndicator(overlayContainer);

  const clear = (): void => {
    highlighter.clear();
    dropIndicator.hideDropIndicator();
  };

  return {
    clear,
    render: ({ targetRect, validity, warning, indicator }): void => {
      if (targetRect === null) {
        clear();
        return;
      }
      highlighter.highlight({
        rect: targetRect,
        validity,
        ...(warning === null ? {} : { warning }),
      });
      if (indicator === null) {
        dropIndicator.hideDropIndicator();
        return;
      }
      dropIndicator.showDropIndicator(indicator.rect, indicator.orientation);
    },
  };
};
