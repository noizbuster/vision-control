import type { Rect } from "@vision-control/geometry";
import type { CandidateContainer } from "@vision-control/interaction-machine";
import { validateReparent } from "@vision-control/layout-engine";

import {
  getOrAssignMoveRuntimeId,
  layoutRoleForElement,
  type MovePlacementDiagnostic,
  measureReorderContainer,
  placementProgression,
  rectFor,
} from "../components/interaction/reorder-dom-context.js";

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
  readonly onDiagnostic?: (diagnostic: MovePlacementDiagnostic) => void;
}

type CandidateParentResult =
  | { readonly kind: "candidate"; readonly element: Element }
  | { readonly kind: "none" }
  | { readonly kind: "rejected"; readonly diagnostic: MovePlacementDiagnostic };

type DropZone = "before" | "inside" | "after";

export function resolveMoveDropTarget(request: MoveDropTargetRequest): CandidateContainer | null {
  const { document: doc, dragged, sourceParent, pointer } = request;
  for (const hitElement of normalizeHitElements(elementsAtPoint(doc, pointer.x, pointer.y))) {
    const parentResult = resolveCandidateParent({ hitElement, sourceParent, pointer });
    if (parentResult.kind === "rejected") {
      request.onDiagnostic?.(parentResult.diagnostic);
      return null;
    }
    if (parentResult.kind === "none") continue;
    const candidateParent = parentResult.element;
    if (!isCandidateParent(candidateParent, dragged, sourceParent)) {
      request.onDiagnostic?.({
        kind: "unsupported-context",
        message: "Move cannot target the selected element, its descendants, or its source branch.",
      });
      continue;
    }
    const contentModel = validateReparent(
      candidateParent.tagName.toLowerCase(),
      dragged.tagName.toLowerCase(),
    );
    if (!contentModel.ok) {
      request.onDiagnostic?.({
        kind: "unsupported-context",
        message: `${contentModel.violation.code}: ${contentModel.violation.reason}`,
      });
      return null;
    }
    const measurement = measureReorderContainer(candidateParent, dragged);
    if (!measurement.ok) {
      request.onDiagnostic?.(measurement.diagnostic);
      return null;
    }
    return {
      parent: describeReparentElement(candidateParent),
      layoutRole: measurement.measurement.layoutRole,
      flow: measurement.measurement.flow,
      rect: measurement.measurement.rect,
      children: measurement.measurement.children,
    };
  }
  return null;
}

export function describeReparentElement(element: Element): CandidateContainer["parent"] {
  return {
    ref: {
      runtimeId: getOrAssignMoveRuntimeId(element),
      tagName: element.tagName.toLowerCase(),
    },
    tagName: element.tagName.toLowerCase(),
  };
}

function resolveCandidateParent(input: {
  readonly hitElement: Element;
  readonly sourceParent: Element;
  readonly pointer: MoveDropTargetRequest["pointer"];
}): CandidateParentResult {
  const { hitElement, sourceParent, pointer } = input;
  if (!isContainerLike(hitElement)) {
    return hitElement.parentElement === null
      ? { kind: "none" }
      : { kind: "candidate", element: hitElement.parentElement };
  }
  if (hitElement.children.length === 0) {
    return { kind: "candidate", element: hitElement };
  }

  const zoneResult = containerDropZone(hitElement, pointer);
  if (!zoneResult.ok) return { kind: "rejected", diagnostic: zoneResult.diagnostic };
  if (zoneResult.zone === "inside") {
    return { kind: "candidate", element: hitElement };
  }

  const parent = hitElement.parentElement;
  if (parent === sourceParent) {
    return { kind: "none" };
  }
  return parent === null ? { kind: "none" } : { kind: "candidate", element: parent };
}

function containerDropZone(
  element: Element,
  pointer: MoveDropTargetRequest["pointer"],
):
  | { readonly ok: true; readonly zone: DropZone }
  | { readonly ok: false; readonly diagnostic: MovePlacementDiagnostic } {
  const parent = element.parentElement;
  if (parent === null) {
    return { ok: true, zone: "inside" };
  }
  const measurement = measureReorderContainer(parent, null);
  if (!measurement.ok) return measurement;
  const progression = placementProgression(measurement.measurement.flow);
  const rect = rectFor(element);
  const start = progression.axis === "x" ? rect.x : rect.y;
  const size = progression.axis === "x" ? rect.width : rect.height;
  if (size <= 0) {
    return { ok: true, zone: "inside" };
  }
  const pointerPosition = progression.axis === "x" ? pointer.x : pointer.y;
  const physicalOffset = (pointerPosition - start) / size;
  const relativePosition = progression.sign === 1 ? physicalOffset : 1 - physicalOffset;
  if (relativePosition < LEADING_DROP_ZONE) {
    return { ok: true, zone: "before" };
  }
  if (relativePosition > TRAILING_DROP_ZONE) {
    return { ok: true, zone: "after" };
  }
  return { ok: true, zone: "inside" };
}

function isCandidateParent(element: Element, dragged: Element, sourceParent: Element): boolean {
  if (element === dragged || dragged.contains(element)) return false;
  if (element === sourceParent || element.contains(sourceParent)) return false;
  if (sourceParent.contains(element) && !isContainerLike(element)) return false;
  return true;
}

function isContainerLike(element: Element): boolean {
  if (element.children.length > 0) return true;
  return isExplicitDropContainer(element);
}

function isExplicitDropContainer(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (SOURCE_TREE_CONTAINER_TAGS.has(tagName)) return true;
  const layoutRole = layoutRoleForElement(element);
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

function area(rect: Rect): number {
  return rect.width * rect.height;
}
