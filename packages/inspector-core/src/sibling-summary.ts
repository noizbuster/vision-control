/**
 * Build a sibling context summary for the selected element.
 */

import type { ElementRef } from "@vision-control/element-identity";
import type { DomAdapter } from "./dom-adapter.js";
import type { SiblingSummary } from "./inspector-data.js";

/**
 * Report how many siblings the selected element has, its index among them, and
 * the parent's tag / ARIA role. This helps layout reasoning (e.g. Flex order
 * changes) without leaking child content.
 */
export function buildSiblingSummary(
  element: Element,
  domAdapter: DomAdapter,
  parentRef?: ElementRef,
): SiblingSummary {
  const parent = domAdapter.getParent(element);
  const siblings = parent === null ? [element] : Array.from(parent.children);
  const index = siblings.indexOf(element);

  const parentData = parent === null ? undefined : domAdapter.getElementData(parent);

  return {
    count: siblings.length,
    index: index >= 0 ? index : 0,
    parentTagName: parentData?.tagName ?? "",
    parentLayoutRole: parentData?.role,
    ...(parentRef !== undefined ? { parent: parentRef } : {}),
  };
}
