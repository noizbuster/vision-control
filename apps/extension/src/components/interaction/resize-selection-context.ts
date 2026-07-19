import type { ElementRef } from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";
import type { ResizeAxis, ResizeTarget } from "@vision-control/interaction-machine";
import type { LayoutComputedStyle, ResizePropertyKind } from "@vision-control/layout-engine";

export interface ResizeComputedStyle {
  readonly display: string;
  readonly position: string;
  readonly boxSizing: string;
  readonly width: string;
  readonly height: string;
  readonly minWidth: string;
  readonly maxWidth: string;
  readonly minHeight: string;
  readonly maxHeight: string;
  readonly paddingTop: string;
  readonly paddingRight: string;
  readonly paddingBottom: string;
  readonly paddingLeft: string;
  readonly borderTopWidth: string;
  readonly borderRightWidth: string;
  readonly borderBottomWidth: string;
  readonly borderLeftWidth: string;
  readonly marginTop: string;
  readonly marginRight: string;
  readonly marginBottom: string;
  readonly marginLeft: string;
  readonly flexBasis: string;
  readonly flexGrow: string;
  readonly flexShrink: string;
  readonly flexDirection: string;
  readonly flexWrap: string;
  readonly alignSelf: string;
  readonly alignItems: string;
  readonly alignContent: string;
  readonly justifyContent: string;
  readonly rowGap: string;
  readonly columnGap: string;
  readonly aspectRatio: string;
  readonly order: string;
  readonly writingMode: string;
  readonly direction: string;
  readonly transform: string;
  readonly zoom: string;
}

export interface ResizeElementSnapshot {
  readonly element: Element;
  readonly ref: ElementRef;
  readonly rect: Rect;
  readonly style: ResizeComputedStyle;
  readonly selectorOccurrence: number;
  readonly fingerprint: string;
}

export interface ResizeAncestorSnapshot {
  readonly element: Element;
  readonly transform: string;
  readonly zoom: string;
}

export interface SelectedElementContext {
  readonly target: ResizeElementSnapshot;
  readonly parent: ResizeElementSnapshot;
  readonly directChildren: readonly ResizeElementSnapshot[];
  readonly directChildNodes: readonly ChildNode[];
  readonly hasDirectTextNode: boolean;
  readonly ancestorChain: readonly ResizeAncestorSnapshot[];
  readonly layoutComputedStyle: LayoutComputedStyle;
}

export type SingleResizeTargetResult =
  | { readonly ok: true; readonly target: ResizeTarget }
  | {
      readonly ok: false;
      readonly diagnostic: "invalid-computed-start";
      readonly property: ResizePropertyKind;
      readonly value: string;
    };

const PROPERTY_TO_AXIS: Record<ResizePropertyKind, ResizeAxis> = {
  width: "x",
  height: "y",
  "flex-basis": "x",
  "flex-grow": "x",
  "flex-shrink": "x",
  "min-width": "x",
  "max-width": "x",
  "min-height": "y",
  "max-height": "y",
  "aspect-ratio": "x",
  "align-self": "y",
};

const propertyUnit = (property: ResizePropertyKind): string =>
  property === "flex-grow" || property === "flex-shrink" ? "" : "px";

const computedValue = (style: ResizeComputedStyle, property: ResizePropertyKind): string => {
  switch (property) {
    case "width":
      return style.width;
    case "height":
      return style.height;
    case "flex-basis":
      return style.flexBasis;
    case "flex-grow":
      return style.flexGrow;
    case "flex-shrink":
      return style.flexShrink;
    case "min-width":
      return style.minWidth;
    case "max-width":
      return style.maxWidth;
    case "min-height":
      return style.minHeight;
    case "max-height":
      return style.maxHeight;
    case "aspect-ratio":
      return "";
    case "align-self":
      return style.alignSelf;
  }
};

const parseComputedStart = (value: string, unit: string): number | null => {
  const normalized = value.trim().toLowerCase();
  const numeric =
    unit === "" ? normalized : normalized.endsWith(unit) ? normalized.slice(0, -unit.length) : "";
  if (numeric.length === 0) return null;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
};

const usedFlexBasis = (context: SelectedElementContext): number => {
  const direction = context.parent.style.flexDirection;
  return direction === "column" || direction === "column-reverse"
    ? context.target.rect.height
    : context.target.rect.width;
};

export const isSingleResizeProperty = (property: ResizePropertyKind): boolean =>
  property !== "aspect-ratio" && property !== "align-self";

export const createSingleResizeTarget = (
  context: SelectedElementContext,
  property: ResizePropertyKind,
): SingleResizeTargetResult => {
  const unit = propertyUnit(property);
  const value = computedValue(context.target.style, property);
  const parsed =
    property === "flex-basis" && value.trim().toLowerCase() === "auto"
      ? usedFlexBasis(context)
      : parseComputedStart(value, unit);
  if (parsed === null) return { ok: false, diagnostic: "invalid-computed-start", property, value };
  return {
    ok: true,
    target: {
      element: context.target.ref,
      property,
      axis: PROPERTY_TO_AXIS[property],
      fromValue: parsed,
      unit,
      rect: context.target.rect,
    },
  };
};
