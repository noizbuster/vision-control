import { createOperationId } from "@vision-control/change-ir";
import type { Rect } from "@vision-control/geometry";
import {
  classifyLayoutRole,
  type Direction,
  type FlexAxisInput,
  type FlexDirection,
  type FlexWrapMode,
  type InsertionFlow,
  type LayoutRole,
  type MoveInsertionInput,
  type MoveItemBox,
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
export type MoveContainerMeasurement = {
  readonly element: Element;
  readonly layoutRole: LayoutRole;
  readonly flow: MoveInsertionInput["flow"];
  readonly rect: Rect;
  readonly childCount: number;
  readonly items: readonly MoveItemBox[];
  readonly childElements: readonly Element[];
  readonly targetContextPositioned: boolean;
};

export type MoveMeasurementDiagnostic = {
  readonly kind:
    | "unsupported-context"
    | "invalid-geometry"
    | "ambiguous-flex-lines"
    | "unsupported-grid";
  readonly message: string;
};

export type MoveContainerResult =
  | { readonly ok: true; readonly measurement: MoveContainerMeasurement }
  | { readonly ok: false; readonly diagnostic: MoveMeasurementDiagnostic };

export type MoveSourceContext = {
  readonly sourceRect: Rect;
  readonly order: number;
  readonly sourceParentRole: LayoutRole;
  readonly sourceContextPositioned: boolean;
};

export type MoveSourceContextResult =
  | { readonly ok: true; readonly measurement: MoveSourceContext }
  | { readonly ok: false; readonly diagnostic: MoveMeasurementDiagnostic };

const parseFlexWrap = (value: string): FlexWrapMode | null => {
  switch (value.trim().toLowerCase()) {
    case "":
    case "nowrap":
      return "nowrap";
    case "wrap":
      return "wrap";
    case "wrap-reverse":
      return "wrap-reverse";
    default:
      return null;
  }
};

const isFinitePositiveRect = (rect: Rect): boolean =>
  Number.isFinite(rect.x) &&
  Number.isFinite(rect.y) &&
  Number.isFinite(rect.width) &&
  Number.isFinite(rect.height) &&
  rect.width > 0 &&
  rect.height > 0;

const parseCssInteger = (value: string): number | null => {
  const parsed = Number(value.trim() || "0");
  return Number.isInteger(parsed) && Number.isFinite(parsed) ? parsed : null;
};

const parseMargin = (value: string): number | null => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasVisualTransform = (style: CSSStyleDeclaration): boolean =>
  [style.transform, style.translate, style.rotate, style.scale].some(
    (value) => value.trim() !== "" && value.trim() !== "none",
  );

const moveUnsupported = (message: string): MoveContainerResult => ({
  ok: false,
  diagnostic: { kind: "unsupported-context", message },
});

const readMoveItem = (
  element: Element,
  domIndex: number,
  flex: boolean,
): MoveItemBox | MoveMeasurementDiagnostic => {
  const style = getComputedStyleFor(element);
  const order = parseCssInteger(style.order);
  if (order === null) {
    return {
      kind: "ambiguous-flex-lines",
      message: "Move requires each direct child to have an integer CSS order.",
    };
  }
  const rect = rectFor(element);
  const inFlow =
    style.display !== "none" &&
    style.visibility === "visible" &&
    style.position !== "absolute" &&
    style.position !== "fixed";
  const rawMargins = [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft];
  const parsedMargins = rawMargins.map(parseMargin);
  if (flex && inFlow && parsedMargins.some((margin) => margin === null)) {
    return {
      kind: "ambiguous-flex-lines",
      message: "Flex Move requires finite physical margins for in-flow children.",
    };
  }
  if (flex && parsedMargins.some((margin) => margin !== null && margin < -0.5)) {
    return {
      kind: "ambiguous-flex-lines",
      message: "Flex Move does not support negative physical margins.",
    };
  }
  const [top = 0, right = 0, bottom = 0, left = 0] = parsedMargins;
  return {
    rect,
    margins: flex
      ? {
          top: Math.max(0, top ?? 0),
          right: Math.max(0, right ?? 0),
          bottom: Math.max(0, bottom ?? 0),
          left: Math.max(0, left ?? 0),
        }
      : { top: 0, right: 0, bottom: 0, left: 0 },
    domIndex,
    order,
    inFlow,
  };
};

export const measureMoveContainer = (
  element: Element,
  movingElement: Element | null,
): MoveContainerResult => {
  const style = getComputedStyleFor(element);
  const layoutRole = layoutRoleFromStyle(element, style);
  const rect = rectFor(element);
  if (!isFinitePositiveRect(rect)) return moveUnsupported("Move target has invalid geometry.");
  if (
    layoutRole !== "normal-flow-block" &&
    layoutRole !== "inline-block" &&
    layoutRole !== "flex-container" &&
    layoutRole !== "flex-item" &&
    layoutRole !== "grid-container"
  ) {
    return moveUnsupported("Move target does not establish a supported flow container.");
  }

  const writingMode = parseWritingMode(style.writingMode);
  if (writingMode === null) return moveUnsupported("Move target has an unsupported writing mode.");
  const directChildren = Array.from(element.children).filter((child) => child !== movingElement);
  if (layoutRole === "grid-container" && directChildren.length > 0) {
    return {
      ok: false,
      diagnostic: {
        kind: "unsupported-grid",
        message: "Move does not support insertion into a populated grid.",
      },
    };
  }

  let flow: MoveInsertionInput["flow"] = { kind: "block", writingMode };
  if (layoutRole === "flex-container") {
    const axis = readFlexAxis(style);
    const wrap = parseFlexWrap(style.flexWrap);
    if (axis === null || wrap === null)
      return moveUnsupported("Flex Move has unsupported axis metadata.");
    flow = { kind: "flex", axis, wrap };
  }

  const items: MoveItemBox[] = [];
  for (const [domIndex, child] of directChildren.entries()) {
    if (hasVisualTransform(getComputedStyleFor(child))) {
      return {
        ok: false,
        diagnostic: {
          kind: layoutRole === "flex-container" ? "ambiguous-flex-lines" : "unsupported-context",
          message: "Move does not support transformed direct children.",
        },
      };
    }
    const item = readMoveItem(child, domIndex, layoutRole === "flex-container");
    if ("kind" in item) return { ok: false, diagnostic: item };
    items.push(item);
  }

  return {
    ok: true,
    measurement: {
      element,
      layoutRole,
      flow,
      rect,
      childCount: directChildren.length,
      items,
      childElements: directChildren,
      targetContextPositioned:
        style.position === "absolute" || style.position === "fixed" || style.position === "sticky",
    },
  };
};

export const measureMoveSourceContext = (
  selected: Element,
  parent: Element,
): MoveSourceContextResult => {
  if (selected.parentElement !== parent) {
    return {
      ok: false,
      diagnostic: {
        kind: "unsupported-context",
        message: "Selected element is no longer a direct child.",
      },
    };
  }
  const selectedStyle = getComputedStyleFor(selected);
  const rect = rectFor(selected);
  const order = parseCssInteger(selectedStyle.order);
  if (
    selectedStyle.display === "none" ||
    selectedStyle.visibility !== "visible" ||
    !isFinitePositiveRect(rect) ||
    selectedStyle.float !== "none" ||
    (selectedStyle.position !== "static" && selectedStyle.position !== "relative") ||
    hasVisualTransform(selectedStyle) ||
    order === null
  ) {
    return {
      ok: false,
      diagnostic: {
        kind: "unsupported-context",
        message: "Selected element is not a supported in-flow Move participant.",
      },
    };
  }
  const parentStyle = getComputedStyleFor(parent);
  const sourceParentRole = layoutRoleFromStyle(parent, parentStyle);
  if (sourceParentRole === "grid-container") {
    return {
      ok: false,
      diagnostic: { kind: "unsupported-grid", message: "Move does not support a grid source." },
    };
  }
  return {
    ok: true,
    measurement: {
      sourceRect: rect,
      order,
      sourceParentRole,
      sourceContextPositioned:
        parentStyle.position === "absolute" ||
        parentStyle.position === "fixed" ||
        parentStyle.position === "sticky",
    },
  };
};

export const placementProgression = (
  flow: InsertionFlow,
): { readonly axis: "x" | "y"; readonly sign: 1 | -1 } =>
  flow.kind === "flex" ? resolveFlexAxis(flow.axis) : { axis: "y", sign: 1 };

const moveRuntimeIds = new WeakMap<Element, string>();

export const getOrAssignMoveRuntimeId = (element: Element): string => {
  const cached = moveRuntimeIds.get(element);
  if (cached !== undefined) return cached;
  const seeded = element.getAttribute(PREVIEW_ID_ATTR);
  const runtimeId =
    seeded !== null && /^[A-Za-z0-9_-]+$/.test(seeded)
      ? seeded
      : `vc-reorder-${createOperationId()}`;
  moveRuntimeIds.set(element, runtimeId);
  return runtimeId;
};
