/**
 * Extract an MVP-relevant subset of computed styles for the inspector panel.
 */

import type { DomAdapter } from "./dom-adapter.js";
import type { ComputedStyleSummary } from "./inspector-data.js";

/**
 * Build a {@link ComputedStyleSummary} from the browser's computed styles.
 *
 * Only the properties the panel groups under Layout, Flex, Dimensions, Spacing,
 * Color, and Typography are included. The full computed style map (~300
 * properties) is deliberately avoided to keep summaries small and to prevent
 * leaking custom properties that may contain secrets.
 */
export function buildComputedStyleSummary(
  element: Element,
  domAdapter: DomAdapter,
): ComputedStyleSummary {
  const style = domAdapter.getComputedStyle(element);

  return {
    display: style.display,
    position: style.position,
    flexDirection: style.flexDirection,
    alignItems: style.alignItems,
    justifyContent: style.justifyContent,
    flexBasis: style.flexBasis,
    flexGrow: style.flexGrow,
    width: style.width,
    height: style.height,
    padding: style.paddingTop,
    margin: style.marginTop,
    border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
    color: style.color,
    backgroundColor: style.backgroundColor,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
  };
}
