/**
 * Browser DOM adapter for the inspector.
 *
 * This is the ONLY inspector-core module that reads from `document`/`window`.
 * All other inspector logic consumes plain data interfaces so it can be unit
 * tested with a fake adapter.
 */

import type { AncestorDescriptor, ElementDescriptor } from "@vision-control/element-identity";
import { type Rect, rectFromDomRect } from "@vision-control/geometry";

/** A lightweight snapshot of the computed styles the inspector cares about. */
export interface ComputedStyleSnapshot {
  readonly display: string;
  readonly position: string;
  readonly flexDirection: string;
  readonly justifyContent: string;
  readonly alignItems: string;
  readonly flexBasis: string;
  readonly flexGrow: string;
  readonly width: string;
  readonly height: string;
  readonly paddingTop: string;
  readonly paddingRight: string;
  readonly paddingBottom: string;
  readonly paddingLeft: string;
  readonly marginTop: string;
  readonly marginRight: string;
  readonly marginBottom: string;
  readonly marginLeft: string;
  readonly borderTopWidth: string;
  readonly borderRightWidth: string;
  readonly borderBottomWidth: string;
  readonly borderLeftWidth: string;
  readonly borderTopStyle: string;
  readonly borderTopColor: string;
  readonly color: string;
  readonly backgroundColor: string;
  readonly fontSize: string;
  readonly fontWeight: string;
  readonly lineHeight: string;
}

/** All DOM-derived data the inspector needs for a single element. */
export interface ElementData {
  readonly tagName: string;
  readonly id: string;
  readonly className: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly boundingRect: Rect;
  readonly computedStyle: ComputedStyleSnapshot;
  readonly role: string | undefined;
  readonly name: string | undefined;
  readonly parent: Element | null;
  readonly children: readonly Element[];
}

/** Contract for DOM access. The browser adapter is the canonical implementation. */
export interface DomAdapter {
  readonly getElementData: (element: Element) => ElementData;
  readonly getDescriptor: (element: Element) => ElementDescriptor;
  readonly getBoundingRect: (element: Element) => Rect;
  readonly getComputedStyle: (element: Element) => ComputedStyleSnapshot;
  readonly getParent: (element: Element) => Element | null;
  readonly getChildren: (element: Element) => readonly Element[];
  readonly getScrollParents: (element: Element) => readonly Element[];
}

/** Build a DOM adapter that reads from the current window/document. */
export function createBrowserDomAdapter(): DomAdapter {
  return {
    getElementData,
    getDescriptor,
    getBoundingRect,
    getComputedStyle,
    getParent,
    getChildren,
    getScrollParents,
  };
}

function getElementData(element: Element): ElementData {
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id,
    className: element.className,
    attributes: readAttributes(element),
    boundingRect: getBoundingRect(element),
    computedStyle: getComputedStyle(element),
    role: element.getAttribute("role") ?? undefined,
    name: (element as HTMLElement).getAttribute("aria-label") ?? undefined,
    parent: getParent(element),
    children: getChildren(element),
  };
}

function getDescriptor(element: Element): ElementDescriptor {
  const tagName = element.tagName.toLowerCase();
  const id = element.id;
  const className = element.className;
  const nthChild = computeNthChild(element);
  return {
    tagName,
    attributes: readAttributes(element),
    ...(id.length > 0 ? { id } : {}),
    ...(className.length > 0 ? { className } : {}),
    ancestry: buildAncestry(element),
    ...(nthChild !== undefined ? { nthChild } : {}),
  };
}

function getBoundingRect(element: Element): Rect {
  return rectFromDomRect(element.getBoundingClientRect());
}

function getComputedStyle(element: Element): ComputedStyleSnapshot {
  const style = window.getComputedStyle(element);
  return {
    display: style.display,
    position: style.position,
    flexDirection: style.flexDirection,
    justifyContent: style.justifyContent,
    alignItems: style.alignItems,
    flexBasis: style.flexBasis,
    flexGrow: style.flexGrow,
    width: style.width,
    height: style.height,
    paddingTop: style.paddingTop,
    paddingRight: style.paddingRight,
    paddingBottom: style.paddingBottom,
    paddingLeft: style.paddingLeft,
    marginTop: style.marginTop,
    marginRight: style.marginRight,
    marginBottom: style.marginBottom,
    marginLeft: style.marginLeft,
    borderTopWidth: style.borderTopWidth,
    borderRightWidth: style.borderRightWidth,
    borderBottomWidth: style.borderBottomWidth,
    borderLeftWidth: style.borderLeftWidth,
    borderTopStyle: style.borderTopStyle,
    borderTopColor: style.borderTopColor,
    color: style.color,
    backgroundColor: style.backgroundColor,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
  };
}

function getParent(element: Element): Element | null {
  return element.parentElement;
}

function getChildren(element: Element): readonly Element[] {
  return Array.from(element.children);
}

function getScrollParents(element: Element): readonly Element[] {
  const parents: Element[] = [];
  let current: Element | null = element.parentElement;
  while (current !== null) {
    const style = window.getComputedStyle(current);
    if (
      isScrollContainer(style.overflow) ||
      isScrollContainer(style.overflowX) ||
      isScrollContainer(style.overflowY)
    ) {
      parents.push(current);
    }
    current = current.parentElement;
  }
  return parents;
}

function readAttributes(element: Element): Readonly<Record<string, string>> {
  const record: Record<string, string> = {};
  for (const attr of element.attributes) {
    record[attr.name] = attr.value;
  }
  return record;
}

function buildAncestry(element: Element): readonly AncestorDescriptor[] {
  const ancestors: AncestorDescriptor[] = [];
  let current: Element | null = element.parentElement;
  while (current !== null) {
    const ancestorId = current.id;
    const ancestorClass = current.className;
    const nthChild = computeNthChild(current);
    ancestors.unshift({
      tagName: current.tagName.toLowerCase(),
      ...(ancestorId.length > 0 ? { id: ancestorId } : {}),
      ...(ancestorClass.length > 0 ? { className: ancestorClass } : {}),
      ...(nthChild !== undefined ? { nthChild } : {}),
    });
    current = current.parentElement;
  }
  return ancestors;
}

function computeNthChild(element: Element): number | undefined {
  const parent = element.parentElement;
  if (parent === null) return undefined;
  const siblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
  const index = siblings.indexOf(element);
  return index >= 0 ? index + 1 : undefined;
}

function isScrollContainer(overflow: string): boolean {
  return overflow === "auto" || overflow === "scroll";
}
