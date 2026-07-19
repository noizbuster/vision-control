import type {
  FlexBoxMetrics,
  FlexSizeConstraint,
  FlexSizingMemberInput,
} from "@vision-control/layout-engine";

import type { ResizeComputedStyle, ResizeElementSnapshot } from "./resize-selection-context.js";

export const pixel = (value: string): number => {
  const normalized = value.trim().toLowerCase();
  if (!normalized.endsWith("px")) return Number.NaN;
  return Number(normalized.slice(0, -2));
};

const boxMetrics = (style: ResizeComputedStyle, axis: "x" | "y"): FlexBoxMetrics | null => {
  if (style.boxSizing !== "content-box" && style.boxSizing !== "border-box") return null;
  const values =
    axis === "x"
      ? [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth]
      : [style.paddingTop, style.paddingBottom, style.borderTopWidth, style.borderBottomWidth];
  const [paddingMainStart, paddingMainEnd, borderMainStart, borderMainEnd] = values.map(pixel);
  if (
    paddingMainStart === undefined ||
    paddingMainEnd === undefined ||
    borderMainStart === undefined ||
    borderMainEnd === undefined
  ) {
    return null;
  }
  return {
    boxSizing: style.boxSizing,
    paddingMainStart,
    paddingMainEnd,
    borderMainStart,
    borderMainEnd,
  };
};

const constraint = (value: string, bound: "min" | "max"): FlexSizeConstraint => {
  const normalized = value.trim().toLowerCase();
  if (bound === "max" && normalized === "none") return { kind: "none" };
  const numeric = pixel(normalized);
  return Number.isFinite(numeric)
    ? { kind: "numeric", value: numeric }
    : { kind: "keyword", value: normalized };
};

export const sizingInput = (
  snapshot: ResizeElementSnapshot,
  axis: "x" | "y",
): FlexSizingMemberInput | null => {
  const box = boxMetrics(snapshot.style, axis);
  if (box === null) return null;
  const minimum = axis === "x" ? snapshot.style.minWidth : snapshot.style.minHeight;
  const maximum = axis === "x" ? snapshot.style.maxWidth : snapshot.style.maxHeight;
  return {
    beforeBorderBoxMainSize: axis === "x" ? snapshot.rect.width : snapshot.rect.height,
    box,
    min: constraint(minimum, "min"),
    max: constraint(maximum, "max"),
  };
};
