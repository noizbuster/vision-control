/**
 * Build a complete, redactable summary of the selected element.
 *
 * The summary is the read-side context the panel displays and the context
 * compiler exports: identity, breadcrumb, computed styles, box model, classes,
 * attributes, semantic role/name, sibling context, and source confidence.
 */

import {
  type ElementRef,
  generateStableSelector,
  type SelectionIdentity,
} from "@vision-control/element-identity";

import { buildAttributes } from "./attributes.js";
import { buildBoxModelSummary } from "./box-model.js";
import { buildBreadcrumb } from "./breadcrumb.js";
import { buildClassList } from "./class-list.js";
import { buildComputedStyleSummary } from "./computed-style-summary.js";
import type { DomAdapter } from "./dom-adapter.js";
import type { ParentLayoutSummary, SelectionSummary } from "./inspector-data.js";
import { buildSemanticSummary } from "./semantic.js";
import { buildSiblingSummary } from "./sibling-summary.js";

export interface BuildSelectionSummaryOptions {
  readonly runtimeIdForElement?: (element: Element) => string;
}

/** Build the full {@link SelectionSummary} for `element`. */
export function buildSelectionSummary(
  element: Element,
  domAdapter: DomAdapter,
  identity: SelectionIdentity,
  options: BuildSelectionSummaryOptions = {},
): SelectionSummary {
  const parent = domAdapter.getParent(element);
  const parentRef =
    parent !== null && options.runtimeIdForElement !== undefined
      ? buildParentRef(parent, domAdapter, options.runtimeIdForElement)
      : undefined;
  return {
    identity,
    breadcrumb: buildBreadcrumb(element, domAdapter),
    computedStyle: buildComputedStyleSummary(element, domAdapter),
    boxModel: buildBoxModelSummary(element, domAdapter),
    classList: buildClassList(element, domAdapter),
    attributes: buildAttributes(element, domAdapter),
    semantic: buildSemanticSummary(element, domAdapter),
    siblingSummary: buildSiblingSummary(element, domAdapter, parentRef),
    parentLayout: buildParentLayoutSummary(element, domAdapter),
    sourceConfidence: identity.confidence,
  };
}

function buildParentRef(
  element: Element,
  domAdapter: DomAdapter,
  runtimeIdForElement: (element: Element) => string,
): ElementRef {
  const descriptor = domAdapter.getDescriptor(element);
  const data = domAdapter.getElementData(element);
  const sourceId = data.attributes["data-vc-source"];
  return {
    runtimeId: runtimeIdForElement(element),
    tagName: data.tagName,
    selector: generateStableSelector({ descriptor }),
    ...(sourceId !== undefined && sourceId.length > 0 ? { sourceId } : {}),
    ...(data.role !== undefined ? { role: data.role } : {}),
    ...(data.name !== undefined ? { name: data.name } : {}),
  };
}

function buildParentLayoutSummary(element: Element, domAdapter: DomAdapter): ParentLayoutSummary {
  const parent = domAdapter.getParent(element);
  if (parent === null) {
    return { mode: "unknown", display: "" };
  }

  const style = domAdapter.getComputedStyle(parent);
  const mode = inferParentLayoutMode(style.display);
  return {
    mode,
    display: style.display,
    ...(mode === "flex" ? { flexDirection: style.flexDirection } : {}),
  };
}

function inferParentLayoutMode(display: string): ParentLayoutSummary["mode"] {
  if (display === "flex") return "flex";
  if (display === "grid") return "grid";
  if (display.startsWith("inline")) return "inline";
  if (display === "block" || display === "none" || display === "") return "block";
  return "unknown";
}

export type { ParentLayoutMode, ParentLayoutSummary, SelectionSummary } from "./inspector-data.js";
