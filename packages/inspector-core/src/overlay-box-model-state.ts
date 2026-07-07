import type { Rect } from "@vision-control/geometry";
import type { BoxModelState } from "@vision-control/overlay-ui";

import { buildBoxModelSummary } from "./box-model.js";
import type { DomAdapter } from "./dom-adapter.js";

export function buildOverlayBoxModelState(
  element: Element,
  domAdapter: DomAdapter,
  rect: Rect,
): BoxModelState {
  const summary = buildBoxModelSummary(element, domAdapter);
  return {
    rect,
    margin: summary.margin,
    border: summary.border,
    padding: summary.padding,
  };
}
