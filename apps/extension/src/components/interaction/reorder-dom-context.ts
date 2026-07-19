import { createOperationId } from "@vision-control/change-ir";
import type { Rect } from "@vision-control/geometry";
import {
  classifyLayoutRole,
  type Direction,
  type FlexAxisInput,
  type FlexDirection,
  type InsertionFlow,
  type LayoutRole,
  resolveFlexAxis,
  type WritingMode,
} from "@vision-control/layout-engine";
import { PREVIEW_ID_ATTR } from "@vision-control/preview-engine";

export type MovePlacementDiagnostic = {
  readonly kind: "unsupported-context" | "css-order-warning";
  readonly message: string;
};

export type ReorderContainerMeasurement = {
  readonly element: Element;
  readonly layoutRole: LayoutRole;
  readonly flow: InsertionFlow;
  readonly rect: Rect;
  readonly children: readonly { readonly rect: Rect }[];
};

export type ReorderContainerResult =
  | { readonly ok: true; readonly measurement: ReorderContainerMeasurement }
  | { readonly ok: false; readonly diagnostic: MovePlacementDiagnostic };

const unsupported = (message: string): ReorderContainerResult => ({
  ok: false,
  diagnostic: { kind: "unsupported-context", message },
});

const cssOrderRejected = (): ReorderContainerResult => ({
  ok: false,
  diagnostic: {
    kind: "css-order-warning",
    message: "Flex children use nonzero CSS order; Move requires visual and DOM order to match.",
  },
});

const parseWritingMode = (value: string): WritingMode | null => {
  switch (value.trim().toLowerCase()) {
    case "":
    case "horizontal-tb":
      return "horizontal-tb";
    case "vertical-rl":
      return "vertical-rl";
    case "vertical-lr":
      return "vertical-lr";
    default:
      return null;
  }
};

const parseDirection = (value: string): Direction | null => {
  switch (value.trim().toLowerCase()) {
    case "":
    case "ltr":
      return "ltr";
    case "rtl":
      return "rtl";
    default:
      return null;
  }
};

const parseFlexDirection = (value: string): FlexDirection | null => {
  switch (value.trim().toLowerCase()) {
    case "":
    case "row":
      return "row";
    case "row-reverse":
      return "row-reverse";
    case "column":
      return "column";
    case "column-reverse":
      return "column-reverse";
    default:
      return null;
  }
};

const readFlexAxis = (style: CSSStyleDeclaration): FlexAxisInput | null => {
  const writingMode = parseWritingMode(style.writingMode);
  const direction = parseDirection(style.direction);
  const flexDirection = parseFlexDirection(style.flexDirection);
  return writingMode === null || direction === null || flexDirection === null
    ? null
    : { writingMode, direction, flexDirection };
};

export const getComputedStyleFor = (element: Element): CSSStyleDeclaration =>
  element.ownerDocument.defaultView?.getComputedStyle(element) ?? getComputedStyle(element);

export const rectFor = (element: Element): Rect => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};

const layoutRoleFromStyle = (element: Element, style: CSSStyleDeclaration): LayoutRole =>
  classifyLayoutRole({
    display: style.display,
    flexDirection: style.flexDirection,
    position: style.position,
    tagName: element.tagName.toLowerCase(),
  });

export const layoutRoleForElement = (element: Element): LayoutRole =>
  layoutRoleFromStyle(element, getComputedStyleFor(element));

const hasUnsupportedFlexChild = (children: readonly Element[]): boolean =>
  children.some((child) => {
    const style = getComputedStyleFor(child);
    return style.position === "absolute" || style.position === "fixed";
  });

const hasNonzeroOrder = (children: readonly Element[]): boolean =>
  children.some((child) => {
    const order = getComputedStyleFor(child).order.trim();
    return order !== "" && order !== "0";
  });

export const measureReorderContainer = (
  element: Element,
  excludedChild: Element | null,
): ReorderContainerResult => {
  const style = getComputedStyleFor(element);
  const layoutRole = layoutRoleFromStyle(element, style);
  const directChildren = Array.from(element.children);
  let flow: InsertionFlow = { kind: "block" };
  if (layoutRole === "flex-container") {
    const axis = readFlexAxis(style);
    if (axis === null) return unsupported("Flex Move does not support this axis metadata.");
    const flexWrap = style.flexWrap.trim().toLowerCase();
    if (flexWrap !== "" && flexWrap !== "nowrap") {
      return unsupported("Flex Move does not support wrapped multi-line containers.");
    }
    if (hasNonzeroOrder(directChildren)) return cssOrderRejected();
    if (hasUnsupportedFlexChild(directChildren)) {
      return unsupported("Flex Move does not support out-of-flow direct children.");
    }
    flow = { kind: "flex", axis };
  }
  return {
    ok: true,
    measurement: {
      element,
      layoutRole,
      flow,
      rect: rectFor(element),
      children: directChildren
        .filter((child) => child !== excludedChild)
        .map((child) => ({ rect: rectFor(child) })),
    },
  };
};

export const placementProgression = (
  flow: InsertionFlow,
): { readonly axis: "x" | "y"; readonly sign: 1 | -1 } =>
  flow.kind === "flex" ? resolveFlexAxis(flow.axis) : { axis: "y", sign: 1 };

export const getOrAssignMoveRuntimeId = (element: Element): string => {
  const existing = element.getAttribute(PREVIEW_ID_ATTR);
  if (existing !== null && existing.length > 0) return existing;
  const runtimeId = `vc-reorder-${createOperationId()}`;
  element.setAttribute(PREVIEW_ID_ATTR, runtimeId);
  return runtimeId;
};
