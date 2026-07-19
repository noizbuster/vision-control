import { createOperationId } from "@vision-control/change-ir";
import {
  computeFingerprint,
  type ElementRef,
  generateStableSelector,
} from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";
import { createBrowserDomAdapter } from "@vision-control/inspector-core";
import type { LayoutComputedStyle } from "@vision-control/layout-engine";
import { PREVIEW_ID_ATTR } from "@vision-control/preview-engine";

import type {
  ResizeElementSnapshot,
  SelectedElementContext,
} from "../components/interaction/resize-selection-context.js";
import { captureResizeComputedStyle } from "./resize-computed-style.js";

export interface SelectionContext {
  readonly element: Element;
  readonly elementRef: ElementRef;
  readonly rect: Rect;
  readonly computedStyle: LayoutComputedStyle;
  readonly resize: SelectedElementContext;
}

export type SelectionCaptureDiagnostic =
  | "detached-parent"
  | "disconnected-element"
  | "invalid-selector"
  | "invalid-selector-occurrence"
  | "invalid-rect";

export type SelectionCaptureResult =
  | { readonly ok: true; readonly context: SelectionContext }
  | { readonly ok: false; readonly diagnostic: SelectionCaptureDiagnostic };

export function getOrAssignPreviewRuntimeId(element: Element): string {
  return element.getAttribute(PREVIEW_ID_ATTR) ?? assignPreviewId(element);
}

const rectOf = (element: Element): Rect => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};

const isFiniteRect = (rect: Rect): boolean =>
  Number.isFinite(rect.x) &&
  Number.isFinite(rect.y) &&
  Number.isFinite(rect.width) &&
  Number.isFinite(rect.height) &&
  rect.width >= 0 &&
  rect.height >= 0;

type SelectorOccurrenceResult =
  | { readonly ok: true; readonly selector: string; readonly occurrence: number }
  | { readonly ok: false; readonly diagnostic: SelectionCaptureDiagnostic };

const structuralSelector = (element: Element): string => {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current !== null) {
    const tagName = current.tagName.toLowerCase();
    if (
      current === current.ownerDocument.documentElement ||
      current === current.ownerDocument.body
    ) {
      segments.unshift(tagName);
      break;
    }
    const parent: Element | null = current.parentElement;
    const root = current.getRootNode();
    const siblings =
      parent !== null ? parent.children : root instanceof ShadowRoot ? root.children : null;
    const index = siblings === null ? 0 : Array.from(siblings).indexOf(current) + 1;
    segments.unshift(index > 0 ? `${tagName}:nth-child(${index})` : tagName);
    current = parent;
  }
  return segments.join(" > ");
};

const selectorOccurrence = (
  element: Element,
  preferredSelector: string,
): SelectorOccurrenceResult => {
  const root = element.getRootNode();
  const query = (selector: string): number => {
    const matches =
      root instanceof ShadowRoot
        ? root.querySelectorAll(selector)
        : element.ownerDocument.querySelectorAll(selector);
    return Array.from(matches).indexOf(element);
  };
  try {
    const preferredOccurrence = query(preferredSelector);
    if (preferredOccurrence >= 0) {
      return { ok: true, selector: preferredSelector, occurrence: preferredOccurrence };
    }
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
  }
  const fallbackSelector = structuralSelector(element);
  try {
    const fallbackOccurrence = query(fallbackSelector);
    return fallbackOccurrence >= 0
      ? { ok: true, selector: fallbackSelector, occurrence: fallbackOccurrence }
      : { ok: false, diagnostic: "invalid-selector-occurrence" };
  } catch (error) {
    if (error instanceof DOMException) return { ok: false, diagnostic: "invalid-selector" };
    throw error;
  }
};

type SnapshotResult =
  | { readonly ok: true; readonly snapshot: ResizeElementSnapshot }
  | { readonly ok: false; readonly diagnostic: SelectionCaptureDiagnostic };

const snapshotOf = (element: Element): SnapshotResult => {
  const adapter = createBrowserDomAdapter();
  const descriptor = adapter.getDescriptor(element);
  const selector = generateStableSelector({ descriptor });
  const sourceId = element.getAttribute("data-vc-source");
  const role = element.getAttribute("role");
  const name = element.getAttribute("aria-label");
  const occurrence = selectorOccurrence(element, selector);
  if (!occurrence.ok) return occurrence;
  const ref: ElementRef = {
    runtimeId: getOrAssignPreviewRuntimeId(element),
    selector: occurrence.selector,
    tagName: element.tagName.toLowerCase(),
    ...(sourceId !== null && sourceId.length > 0 ? { sourceId } : {}),
    ...(role !== null ? { role } : {}),
    ...(name !== null ? { name } : {}),
  };
  return {
    ok: true,
    snapshot: {
      element,
      ref,
      rect: rectOf(element),
      style: captureResizeComputedStyle(element),
      selectorOccurrence: occurrence.occurrence,
      fingerprint: computeFingerprint(descriptor),
    },
  };
};

const composedParentElement = (element: Element): Element | null => {
  if (element.parentElement !== null) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
};

export function captureSelectionContext(element: Element): SelectionCaptureResult {
  if (!element.isConnected) return { ok: false, diagnostic: "disconnected-element" };
  const parentElement = element.parentElement;
  if (parentElement === null) return { ok: false, diagnostic: "detached-parent" };
  const targetResult = snapshotOf(element);
  if (!targetResult.ok) return targetResult;
  const parentResult = snapshotOf(parentElement);
  if (!parentResult.ok) return parentResult;
  const directChildren: ResizeElementSnapshot[] = [];
  for (const child of parentElement.children) {
    const childResult = snapshotOf(child);
    if (!childResult.ok) return childResult;
    directChildren.push(childResult.snapshot);
  }
  const target = targetResult.snapshot;
  const parent = parentResult.snapshot;
  if (![target, parent, ...directChildren].every((snapshot) => isFiniteRect(snapshot.rect))) {
    return { ok: false, diagnostic: "invalid-rect" };
  }
  const directChildNodes = Array.from(parentElement.childNodes);
  const ancestorChain = [];
  let ancestor: Element | null = parentElement;
  while (ancestor !== null) {
    const style = window.getComputedStyle(ancestor);
    ancestorChain.push({
      element: ancestor,
      transform: style.transform,
      zoom: style.getPropertyValue("zoom"),
    });
    ancestor = composedParentElement(ancestor);
  }
  const layoutComputedStyle: LayoutComputedStyle = {
    display: target.style.display,
    flexDirection: target.style.flexDirection,
    position: target.style.position,
    parentDisplay: parent.style.display,
    tagName: target.ref.tagName,
  };
  const resize: SelectedElementContext = {
    target,
    parent,
    directChildren,
    directChildNodes,
    hasDirectTextNode: directChildNodes.some(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent?.trim().length ?? 0) > 0,
    ),
    ancestorChain,
    layoutComputedStyle,
  };
  return {
    ok: true,
    context: {
      element,
      elementRef: target.ref,
      rect: target.rect,
      computedStyle: layoutComputedStyle,
      resize,
    },
  };
}

function assignPreviewId(element: Element): string {
  const id = `vc-interaction-${createOperationId()}`;
  element.setAttribute(PREVIEW_ID_ATTR, id);
  return id;
}
