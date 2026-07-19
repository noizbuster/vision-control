import { createDropIndicator, createDropTargetHighlighter } from "@vision-control/overlay-ui";
import type { ReparentControllerCallbacks } from "../components/interaction/index.js";

export interface InteractionReparentFeedbackOptions {
  readonly overlayRoot: ShadowRoot;
  readonly overlayContainer: HTMLElement;
  readonly onStateChange?: ReparentControllerCallbacks["onStateChange"];
}

export interface InteractionReparentFeedback {
  readonly callbacks: ReparentControllerCallbacks;
  readonly clear: () => void;
}

export function createInteractionReparentFeedback(
  options: InteractionReparentFeedbackOptions,
): InteractionReparentFeedback {
  const highlighter = createDropTargetHighlighter(options.overlayRoot);
  const indicator = createDropIndicator(options.overlayContainer);

  const clear = (): void => {
    highlighter.clear();
    indicator.hideDropIndicator();
  };

  const callbacks: ReparentControllerCallbacks = {
    onStateChange: options.onStateChange ?? (() => {}),
    onHighlight: (state) => {
      if (state === null) {
        clear();
        return;
      }
      highlighter.highlight({
        rect: state.rect,
        validity: state.validity === "valid" ? "valid" : "invalid",
        ...(state.warning !== null ? { warning: state.warning } : {}),
      });
      const indicatorRect =
        state.insertion.axis === "x"
          ? {
              x: state.insertion.position - 1,
              y: state.rect.y,
              width: 2,
              height: state.rect.height,
            }
          : {
              x: state.rect.x,
              y: state.insertion.position - 1,
              width: state.rect.width,
              height: 2,
            };
      indicator.showDropIndicator(
        indicatorRect,
        state.insertion.axis === "x" ? "vertical" : "horizontal",
      );
    },
  };

  return { callbacks, clear };
}
