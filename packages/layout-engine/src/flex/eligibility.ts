import type { FlexDiagnostic, GeometrySubject } from "./diagnostics.js";
import type { FlexItemModel, FlexPairEligibilityInput } from "./eligibility-model.js";
import {
  type FlexAxisResolution,
  resolveFlexAxis,
  selectVisualBoundaryNeighbor,
  visualDomOrder,
} from "./logical-axis.js";

export type FlexPairEligibilityResult =
  | {
      readonly eligible: true;
      readonly axis: FlexAxisResolution;
      readonly primaryDomIndex: number;
      readonly neighborDomIndex: number;
      readonly visualDomIndices: readonly number[];
    }
  | { readonly eligible: false; readonly diagnostic: FlexDiagnostic };

const rejected = (diagnostic: FlexDiagnostic): FlexPairEligibilityResult => ({
  eligible: false,
  diagnostic,
});

const isFiniteRect = (rect: FlexItemModel["rect"]): boolean =>
  Number.isFinite(rect.x) &&
  Number.isFinite(rect.y) &&
  Number.isFinite(rect.width) &&
  Number.isFinite(rect.height);

const geometryDiagnostic = (
  subject: GeometrySubject,
  effects: FlexItemModel["effects"],
): FlexDiagnostic | null => {
  if (effects.transformAffected) {
    return {
      code: "transform_affected_geometry",
      subject,
      message: `${subject} geometry is affected by a transform`,
    };
  }
  if (effects.zoomAffected) {
    return {
      code: "zoom_affected_geometry",
      subject,
      message: `${subject} geometry is affected by zoom`,
    };
  }
  return null;
};

const itemDiagnostic = (item: FlexItemModel, domIndex: number): FlexDiagnostic | null => {
  if (!Number.isInteger(item.order)) {
    return { code: "malformed_model", message: `item ${domIndex} order must be an integer` };
  }
  if (item.order !== 0) {
    return {
      code: "nonzero_order",
      domIndex,
      order: item.order,
      message: `item ${domIndex} has nonzero CSS order`,
    };
  }
  if (!item.inFlow) {
    return { code: "out_of_flow_item", domIndex, message: `item ${domIndex} is out of flow` };
  }
  if (item.display === "contents") {
    return {
      code: "display_contents_item",
      domIndex,
      message: `item ${domIndex} uses display contents`,
    };
  }
  if (!isFiniteRect(item.rect) || item.rect.width < 0 || item.rect.height < 0) {
    return { code: "invalid_box", domIndex, message: `item ${domIndex} has an invalid box` };
  }
  if (item.rect.width === 0 || item.rect.height === 0) {
    return { code: "zero_size_box", domIndex, message: `item ${domIndex} has a zero-size box` };
  }
  if (item.marginMainStart === "auto" || item.marginMainEnd === "auto") {
    return {
      code: "main_axis_auto_margin",
      domIndex,
      message: `item ${domIndex} has a main-axis auto margin`,
    };
  }
  return null;
};

export const evaluateFlexPairEligibility = (
  input: FlexPairEligibilityInput,
): FlexPairEligibilityResult => {
  if (input.container.flexWrap !== "nowrap") {
    return rejected({
      code: "wrapped_layout",
      flexWrap: input.container.flexWrap,
      message: "paired flex resize requires flex-wrap nowrap",
    });
  }
  if (
    !isFiniteRect(input.container.rect) ||
    input.container.rect.width < 0 ||
    input.container.rect.height < 0
  ) {
    return rejected({ code: "invalid_box", domIndex: null, message: "container box is invalid" });
  }
  if (input.container.rect.width === 0 || input.container.rect.height === 0) {
    return rejected({
      code: "zero_size_box",
      domIndex: null,
      message: "container box has zero size",
    });
  }
  if (
    input.container.mainSize === null ||
    !Number.isFinite(input.container.mainSize) ||
    input.container.mainSize <= 0
  ) {
    return rejected({
      code: "indefinite_container_main_size",
      message: "container main size must be finite and positive",
    });
  }
  if (input.container.hasNonWhitespaceDirectText) {
    return rejected({
      code: "anonymous_flex_item",
      message: "non-whitespace direct text creates an anonymous flex item",
    });
  }
  for (const [domIndex, item] of input.items.entries()) {
    const diagnostic = itemDiagnostic(item, domIndex);
    if (diagnostic !== null) return rejected(diagnostic);
  }

  const axis = resolveFlexAxis(input.context);
  const neighbor = selectVisualBoundaryNeighbor({
    childCount: input.items.length,
    primaryDomIndex: input.primaryDomIndex,
    boundary: input.boundary,
    sign: axis.sign,
    ambiguous: input.visualNeighborAmbiguous,
  });
  if (!neighbor.ok) return rejected(neighbor.diagnostic);

  const containerGeometryDiagnostic = geometryDiagnostic("container", input.container.effects);
  if (containerGeometryDiagnostic !== null) return rejected(containerGeometryDiagnostic);
  for (const ancestor of input.container.ancestorEffects) {
    const diagnostic = geometryDiagnostic("ancestor", ancestor);
    if (diagnostic !== null) return rejected(diagnostic);
  }

  const primary = input.items[input.primaryDomIndex];
  const visualNeighbor = input.items[neighbor.neighborDomIndex];
  if (primary === undefined || visualNeighbor === undefined) {
    return rejected({ code: "malformed_model", message: "member indices do not resolve" });
  }
  const primaryDiagnostic = geometryDiagnostic("primary", primary.effects);
  if (primaryDiagnostic !== null) return rejected(primaryDiagnostic);
  const neighborDiagnostic = geometryDiagnostic("neighbor", visualNeighbor.effects);
  if (neighborDiagnostic !== null) return rejected(neighborDiagnostic);

  const order = visualDomOrder({ childCount: input.items.length, sign: axis.sign });
  if (!order.ok) return rejected(order.diagnostic);
  return {
    eligible: true,
    axis,
    primaryDomIndex: input.primaryDomIndex,
    neighborDomIndex: neighbor.neighborDomIndex,
    visualDomIndices: order.domIndices,
  };
};
