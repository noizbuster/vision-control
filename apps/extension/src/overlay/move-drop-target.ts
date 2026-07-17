import { createOperationId } from "@vision-control/change-ir";
import type { Rect } from "@vision-control/geometry";
import type { CandidateContainer } from "@vision-control/interaction-machine";
import { classifyLayoutRole, validateReparent } from "@vision-control/layout-engine";
import { PREVIEW_ID_ATTR } from "@vision-control/preview-engine";

const SOURCE_TREE_CONTAINER_TAGS = new Set([
  "article",
  "aside",
  "dd",
  "details",
  "dl",
  "dt",
  "fieldset",
  "footer",
  "form",
  "header",
  "li",
  "main",
  "nav",
  "ol",
  "section",
  "td",
  "th",
  "ul",
]);
const LEADING_DROP_ZONE = 0.25;
const TRAILING_DROP_ZONE = 0.75;

export interface MoveDropTargetRequest {
  readonly document: Document;
  readonly dragged: Element;
  readonly sourceParent: Element;
  readonly pointer: { readonly x: number; readonly y: number };
}

export function resolveMoveDropTarget(request: MoveDropTargetRequest): CandidateContainer | null {
  const { document: doc, dragged, sourceParent, pointer } = request;
  for (const hitElement of normalizeHitElements(elementsAtPoint(doc, pointer.x, pointer.y))) {
    const candidateParent = resolveCandidateParent(hitElement, sourceParent, pointer);
    if (candidateParent === null || !isCandidateParent(candidateParent, dragged, sourceParent)) {
      continue;
    }
    if (
      !validateReparent(candidateParent.tagName.toLowerCase(), dragged.tagName.toLowerCase()).ok
    ) {
      continue;
    }
    return candidateFor(candidateParent, dragged);
  }
  return null;
}

export function describeReparentElement(element: Element): CandidateContainer["parent"] {
  return {
    ref: {
      runtimeId: getOrAssignRuntimeId(element),
      tagName: element.tagName.toLowerCase(),
    },
    tagName: element.tagName.toLowerCase(),
  };
}

function resolveCandidateParent(
  hitElement: Element,
  sourceParent: Element,
  pointer: MoveDropTargetRequest["pointer"],
): Element | null {
  if (!isContainerLike(hitElement)) {
    return hitElement.parentElement;
  }
  if (hitElement.children.length === 0) {
    return hitElement;
  }

  const zone = containerDropZone(hitElement, pointer);
  if (zone === "inside") {
    return hitElement;
  }

  const parent = hitElement.parentElement;
  if (parent === sourceParent) {
    return null;
  }
  return parent;
}

function containerDropZone(
  element: Element,
  pointer: MoveDropTargetRequest["pointer"],
): "before" | "inside" | "after" {
  const parent = element.parentElement;
  if (parent === null) {
    return "inside";
  }
  const axis = flowAxisFor(parent);
  const rect = rectFor(element);
  const start = axis === "x" ? rect.x : rect.y;
  const size = axis === "x" ? rect.width : rect.height;
  if (size <= 0) {
    return "inside";
  }
  const pointerPosition = axis === "x" ? pointer.x : pointer.y;
  const relativePosition = (pointerPosition - start) / size;
  if (relativePosition < LEADING_DROP_ZONE) {
    return "before";
  }
  if (relativePosition > TRAILING_DROP_ZONE) {
    return "after";
  }
  return "inside";
}

function flowAxisFor(element: Element): "x" | "y" {
  const style = getComputedStyleFor(element);
  const layoutRole = classifyLayoutRole({
    display: style.display,
    flexDirection: style.flexDirection,
    position: style.position,
    tagName: element.tagName.toLowerCase(),
  });
  return layoutRole === "flex-container" && !style.flexDirection.trim().startsWith("column")
    ? "x"
    : "y";
}

function isCandidateParent(element: Element, dragged: Element, sourceParent: Element): boolean {
  if (element === dragged || dragged.contains(element)) return false;
  if (element === sourceParent || element.contains(sourceParent)) return false;
  if (sourceParent.contains(element) && !isContainerLike(element)) return false;
  return true;
}

function candidateFor(element: Element, dragged: Element): CandidateContainer {
  const style = getComputedStyleFor(element);
  return {
    parent: describeReparentElement(element),
    layoutRole: classifyLayoutRole({
      display: style.display,
      flexDirection: style.flexDirection,
      position: style.position,
      tagName: element.tagName.toLowerCase(),
    }),
    flexDirection: style.flexDirection,
    rect: rectFor(element),
    children: Array.from(element.children)
      .filter((child) => child !== dragged)
      .map((child) => ({ rect: rectFor(child) })),
  };
}

function isContainerLike(element: Element): boolean {
  if (element.children.length > 0) return true;
  return isExplicitDropContainer(element);
}

function isExplicitDropContainer(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (SOURCE_TREE_CONTAINER_TAGS.has(tagName)) return true;
  const style = getComputedStyleFor(element);
  const layoutRole = classifyLayoutRole({
    display: style.display,
    flexDirection: style.flexDirection,
    position: style.position,
    tagName,
  });
  return layoutRole === "flex-container" || layoutRole === "grid-container";
}

function normalizeHitElements(hitElements: readonly Element[]): readonly Element[] {
  const normalized = new Set<Element>();
  for (const hitElement of hitElements) {
    normalized.add(normalizeCompositeHit(hitElement));
  }
  return [...normalized];
}

function normalizeCompositeHit(hitElement: Element): Element {
  let current: Element | null = hitElement;
  let fallback: Element | null = null;
  while (current !== null) {
    if (isExplicitDropContainer(current)) {
      return current;
    }
    const parentElement: Element | null = current.parentElement;
    if (parentElement === null) {
      break;
    }
    if (isExplicitDropContainer(parentElement)) {
      return current;
    }
    fallback ??= hasSiblingGroup(current) ? current : null;
    current = parentElement;
  }
  return fallback ?? hitElement;
}

function hasSiblingGroup(element: Element): boolean {
  return (element.parentElement?.children.length ?? 0) > 1;
}

function elementsAtPoint(doc: Document, x: number, y: number): readonly Element[] {
  if (typeof doc.elementsFromPoint === "function") {
    return doc.elementsFromPoint(x, y);
  }
  return Array.from(doc.querySelectorAll("*"))
    .filter((element) => containsPoint(element, x, y))
    .sort((first, second) => area(rectFor(first)) - area(rectFor(second)));
}

function containsPoint(element: Element, x: number, y: number): boolean {
  const rect = rectFor(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  );
}

function getComputedStyleFor(element: Element): CSSStyleDeclaration {
  return element.ownerDocument.defaultView?.getComputedStyle(element) ?? getComputedStyle(element);
}

function rectFor(element: Element): Rect {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function area(rect: Rect): number {
  return rect.width * rect.height;
}

function getOrAssignRuntimeId(element: Element): string {
  const existing = element.getAttribute(PREVIEW_ID_ATTR);
  if (existing !== null && existing.length > 0) return existing;
  const runtimeId = `vc-reparent-${createOperationId()}`;
  element.setAttribute(PREVIEW_ID_ATTR, runtimeId);
  return runtimeId;
}
