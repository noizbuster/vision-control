/**
 * Build a human-readable summary of the selected element.
 *
 * The summary is the read-side context the panel displays: tag, role, name,
 * breadcrumb, and the parent layout mode. Detailed box model and computed
 * styles arrive in task 15.
 */

import type { ElementData } from "./dom-adapter.js";

/** Parent layout context inferred from computed style. */
export type ParentLayoutMode = "flex" | "grid" | "block" | "inline" | "unknown";

/** Summary displayed in the DevTools panel for a selected element. */
export interface SelectionSummary {
  readonly tagName: string;
  readonly role: string | undefined;
  readonly name: string | undefined;
  readonly selector: string;
  readonly breadcrumb: readonly string[];
  readonly parentLayout: ParentLayoutMode;
}

/**
 * Build a {@link SelectionSummary} from DOM data and a previously computed
 * stable selector.
 */
export function buildSelectionSummary(
  elementData: ElementData,
  selector: string,
): SelectionSummary {
  return {
    tagName: elementData.tagName,
    role: elementData.role,
    name: elementData.name,
    selector,
    breadcrumb: buildBreadcrumb(elementData),
    parentLayout: inferParentLayout(elementData),
  };
}

function buildBreadcrumb(elementData: ElementData): readonly string[] {
  const path: string[] = [];
  let current: Element | null = elementData.parent;
  while (current !== null) {
    const tag = current.tagName.toLowerCase();
    const id = current.id;
    path.unshift(id.length > 0 ? `${tag}#${id}` : tag);
    current = current.parentElement;
  }
  return path;
}

function inferParentLayout(elementData: ElementData): ParentLayoutMode {
  const parent = elementData.parent;
  if (parent === null) return "unknown";

  const style = window.getComputedStyle(parent);
  if (style.display === "flex") return "flex";
  if (style.display === "grid") return "grid";
  if (style.display.startsWith("inline")) return "inline";
  return "block";
}
