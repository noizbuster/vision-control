import type { FlexDiagnostic } from "@vision-control/layout-engine";
import {
  evaluateFlexPairEligibility,
  type FlexAxisInput,
  type FlexAxisResolution,
  type FlexDirection,
  type FlexSizingMemberInput,
  parseFlexPairEligibilityInput,
  resolveFlexAxis,
  resolvePhysicalFlexHandle,
  type WritingMode,
} from "@vision-control/layout-engine";
import type { ResizeHandlePosition } from "@vision-control/overlay-ui";
import { pixel, sizingInput } from "./flex-pair-resize-sizing.js";
import type {
  ResizeComputedStyle,
  ResizeElementSnapshot,
  SelectedElementContext,
} from "./resize-selection-context.js";

export type FlexPairResizeRoute =
  | { readonly kind: "not-flex" }
  | { readonly kind: "corner-disabled" }
  | { readonly kind: "cross-axis"; readonly property: "width" | "height" }
  | { readonly kind: "rejected"; readonly diagnostic: FlexDiagnostic }
  | { readonly kind: "pair"; readonly prepared: PreparedFlexPairResize };

export interface PreparedFlexPairResize {
  readonly context: SelectedElementContext;
  readonly axisInput: FlexAxisInput;
  readonly axis: FlexAxisResolution;
  readonly boundary: "main-start" | "main-end";
  readonly physicalHandle: "top" | "right" | "bottom" | "left";
  readonly primary: ResizeElementSnapshot;
  readonly neighbor: ResizeElementSnapshot;
  readonly witnesses: readonly ResizeElementSnapshot[];
  readonly primarySizing: FlexSizingMemberInput;
  readonly neighborSizing: FlexSizingMemberInput;
}

const malformed = (message: string): FlexDiagnostic => ({ code: "malformed_model", message });

const parseWritingMode = (value: string): WritingMode | null => {
  switch (value) {
    case "horizontal-tb":
    case "vertical-rl":
    case "vertical-lr":
      return value;
    default:
      return null;
  }
};

const parseFlexDirection = (value: string): FlexDirection | null => {
  switch (value) {
    case "row":
    case "row-reverse":
    case "column":
    case "column-reverse":
      return value;
    default:
      return null;
  }
};

const cardinalHandle = (
  handle: ResizeHandlePosition,
): "top" | "right" | "bottom" | "left" | null => {
  switch (handle) {
    case "n":
      return "top";
    case "e":
      return "right";
    case "s":
      return "bottom";
    case "w":
      return "left";
    case "ne":
    case "se":
    case "sw":
    case "nw":
      return null;
  }
};

const margin = (value: string): number | "auto" =>
  value.trim().toLowerCase() === "auto" ? "auto" : pixel(value);

const effects = (style: Pick<ResizeComputedStyle, "transform" | "zoom">) => {
  const transform = style.transform.trim().toLowerCase();
  const zoom = style.zoom.trim().toLowerCase();
  const numericZoom = Number(zoom);
  return {
    transformAffected: transform !== "" && transform !== "none",
    zoomAffected:
      zoom !== "" && zoom !== "normal" && (!Number.isFinite(numericZoom) || numericZoom !== 1),
  };
};

const visualNeighborAmbiguous = (
  items: readonly ResizeElementSnapshot[],
  axis: FlexAxisResolution,
): boolean => {
  let previous: number | null = null;
  for (const item of axis.sign === 1 ? items : [...items].reverse()) {
    const center =
      axis.axis === "x" ? item.rect.x + item.rect.width / 2 : item.rect.y + item.rect.height / 2;
    if (previous !== null && center <= previous) return true;
    previous = center;
  }
  return false;
};

export function prepareFlexPairResize(
  context: SelectedElementContext,
  handle: ResizeHandlePosition,
): FlexPairResizeRoute {
  if (context.parent.style.display !== "flex" && context.parent.style.display !== "inline-flex") {
    return { kind: "not-flex" };
  }
  const physicalHandle = cardinalHandle(handle);
  if (physicalHandle === null) return { kind: "corner-disabled" };
  const writingMode = parseWritingMode(context.parent.style.writingMode);
  const direction = context.parent.style.direction;
  const flexDirection = parseFlexDirection(context.parent.style.flexDirection);
  if (
    writingMode === null ||
    (direction !== "ltr" && direction !== "rtl") ||
    flexDirection === null
  ) {
    return { kind: "rejected", diagnostic: malformed("flex axis strings are unsupported") };
  }
  const axisInput: FlexAxisInput = { writingMode, direction, flexDirection };
  const axis = resolveFlexAxis(axisInput);
  const handleResolution = resolvePhysicalFlexHandle({
    axis: axis.axis,
    sign: axis.sign,
    handle: physicalHandle,
  });
  if (handleResolution.kind === "cross-axis") {
    return {
      kind: "cross-axis",
      property: physicalHandle === "left" || physicalHandle === "right" ? "width" : "height",
    };
  }
  const primaryDomIndex = context.directChildren.findIndex(
    (snapshot) => snapshot.element === context.target.element,
  );
  const mainSize = pixel(
    axis.axis === "x" ? context.parent.style.width : context.parent.style.height,
  );
  const parsed = parseFlexPairEligibilityInput({
    context: axisInput,
    boundary: handleResolution.boundary,
    primaryDomIndex,
    visualNeighborAmbiguous: visualNeighborAmbiguous(context.directChildren, axis),
    container: {
      flexWrap: context.parent.style.flexWrap,
      mainSize: Number.isFinite(mainSize) ? mainSize : null,
      rect: context.parent.rect,
      effects: effects(context.parent.style),
      ancestorEffects: context.ancestorChain.slice(1).map((ancestor) => effects(ancestor)),
      hasNonWhitespaceDirectText: context.hasDirectTextNode,
    },
    items: context.directChildren.map((snapshot) => ({
      order: snapshot.style.order.trim() === "" ? 0 : Number(snapshot.style.order),
      inFlow: snapshot.style.position !== "absolute" && snapshot.style.position !== "fixed",
      display: snapshot.style.display === "contents" ? "contents" : "box",
      rect: snapshot.rect,
      marginMainStart: margin(
        axis.axis === "x" ? snapshot.style.marginLeft : snapshot.style.marginTop,
      ),
      marginMainEnd: margin(
        axis.axis === "x" ? snapshot.style.marginRight : snapshot.style.marginBottom,
      ),
      effects: effects(snapshot.style),
    })),
  });
  if (!parsed.ok) return { kind: "rejected", diagnostic: parsed.diagnostic };
  const eligibility = evaluateFlexPairEligibility(parsed.value);
  if (!eligibility.eligible) return { kind: "rejected", diagnostic: eligibility.diagnostic };
  const primary = context.directChildren[eligibility.primaryDomIndex];
  const neighbor = context.directChildren[eligibility.neighborDomIndex];
  if (primary === undefined || neighbor === undefined) {
    return { kind: "rejected", diagnostic: malformed("flex pair members did not resolve") };
  }
  const primarySizing = sizingInput(primary, axis.axis);
  const neighborSizing = sizingInput(neighbor, axis.axis);
  if (primarySizing === null || neighborSizing === null) {
    return { kind: "rejected", diagnostic: malformed("flex pair box sizing is unsupported") };
  }
  return {
    kind: "pair",
    prepared: {
      context,
      axisInput,
      axis,
      boundary: handleResolution.boundary,
      physicalHandle,
      primary,
      neighbor,
      witnesses: context.directChildren.filter(
        (snapshot) => snapshot !== primary && snapshot !== neighbor,
      ),
      primarySizing,
      neighborSizing,
    },
  };
}
