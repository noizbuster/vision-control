/**
 * Build a numeric CSS box model summary for the selected element.
 */

import type { DomAdapter } from "./dom-adapter.js";
import type { BoxModelSummary, EdgeValues } from "./inspector-data.js";

/**
 * Extract margin, border, padding, and content dimensions as JSON-safe
 * numbers. The returned shape mirrors the classic DevTools box model diagram.
 */
export function buildBoxModelSummary(element: Element, domAdapter: DomAdapter): BoxModelSummary {
  const rect = domAdapter.getBoundingRect(element);
  const style = domAdapter.getComputedStyle(element);

  return {
    margin: edgeValues(style.marginTop, style.marginRight, style.marginBottom, style.marginLeft),
    border: edgeValues(
      style.borderTopWidth,
      style.borderRightWidth,
      style.borderBottomWidth,
      style.borderLeftWidth,
    ),
    padding: edgeValues(
      style.paddingTop,
      style.paddingRight,
      style.paddingBottom,
      style.paddingLeft,
    ),
    content: {
      width: rect.width,
      height: rect.height,
    },
    position: {
      x: rect.x,
      y: rect.y,
    },
  };
}

function edgeValues(top: string, right: string, bottom: string, left: string): EdgeValues {
  return {
    top: parsePixelValue(top),
    right: parsePixelValue(right),
    bottom: parsePixelValue(bottom),
    left: parsePixelValue(left),
  };
}

function parsePixelValue(value: string): number {
  if (value === "" || value === "auto") {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
