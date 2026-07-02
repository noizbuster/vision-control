/**
 * Build a clickable DOM ancestry breadcrumb for the selected element.
 */

import type { DomAdapter } from "./dom-adapter.js";
import type { BreadcrumbItem } from "./inspector-data.js";

const BREADCRUMB_MAX_DEPTH = 10;

/**
 * Walk from `element` up to the root, producing a path of breadcrumb items.
 *
 * The path is root-first and truncated to {@link BREADCRUMB_MAX_DEPTH} levels
 * to avoid overwhelming the panel on deeply nested DOMs. Each item carries the
 * live `Element` reference so the panel can select the ancestor on click.
 */
export function buildBreadcrumb(element: Element, domAdapter: DomAdapter): BreadcrumbItem[] {
  const path: BreadcrumbItem[] = [];
  let current: Element | null = element;

  while (current !== null) {
    const data = domAdapter.getElementData(current);
    const selector = buildItemSelector(data);
    path.unshift({
      tagName: data.tagName,
      ...(data.id.length > 0 ? { id: data.id } : {}),
      ...(data.className.length > 0 ? { className: data.className } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(selector.length > 0 ? { selector } : {}),
      element: current,
    });
    current = domAdapter.getParent(current);
  }

  if (path.length <= BREADCRUMB_MAX_DEPTH) {
    return path;
  }
  return path.slice(path.length - BREADCRUMB_MAX_DEPTH);
}

function buildItemSelector(data: { readonly tagName: string; readonly id: string }): string {
  if (data.id.length > 0) {
    return `#${data.id}`;
  }
  return data.tagName;
}
