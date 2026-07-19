import type { ResizeComputedStyle } from "../components/interaction/resize-selection-context.js";

interface ComputedStyleMapValue {
  readonly toString: () => string;
}

interface ComputedStyleMap {
  readonly get: (property: string) => ComputedStyleMapValue | undefined;
}

interface ComputedStyleMapElement {
  readonly computedStyleMap: () => unknown;
}

const hasComputedStyleMap = (element: Element): element is Element & ComputedStyleMapElement =>
  "computedStyleMap" in element && typeof element.computedStyleMap === "function";

const isComputedStyleMap = (value: unknown): value is ComputedStyleMap =>
  typeof value === "object" && value !== null && "get" in value && typeof value.get === "function";

const autoOrResolved = (element: Element, style: CSSStyleDeclaration, property: string): string => {
  const styleMap = hasComputedStyleMap(element) ? element.computedStyleMap() : null;
  if (isComputedStyleMap(styleMap) && styleMap.get(property)?.toString() === "auto") return "auto";
  return style.getPropertyValue(property);
};

export function captureResizeComputedStyle(element: Element): ResizeComputedStyle {
  const style = window.getComputedStyle(element);
  return {
    display: style.display,
    position: style.position,
    boxSizing: style.boxSizing,
    width: autoOrResolved(element, style, "width"),
    height: autoOrResolved(element, style, "height"),
    minWidth: style.minWidth,
    maxWidth: style.maxWidth,
    minHeight: style.minHeight,
    maxHeight: style.maxHeight,
    paddingTop: style.paddingTop,
    paddingRight: style.paddingRight,
    paddingBottom: style.paddingBottom,
    paddingLeft: style.paddingLeft,
    borderTopWidth: style.borderTopWidth,
    borderRightWidth: style.borderRightWidth,
    borderBottomWidth: style.borderBottomWidth,
    borderLeftWidth: style.borderLeftWidth,
    marginTop: autoOrResolved(element, style, "margin-top"),
    marginRight: autoOrResolved(element, style, "margin-right"),
    marginBottom: autoOrResolved(element, style, "margin-bottom"),
    marginLeft: autoOrResolved(element, style, "margin-left"),
    flexBasis: style.flexBasis,
    flexGrow: style.flexGrow,
    flexShrink: style.flexShrink,
    flexDirection: style.flexDirection,
    flexWrap: style.flexWrap,
    alignSelf: style.alignSelf,
    alignItems: style.alignItems,
    alignContent: style.alignContent,
    justifyContent: style.justifyContent,
    rowGap: style.rowGap,
    columnGap: style.columnGap,
    aspectRatio: style.aspectRatio,
    order: style.order,
    writingMode: style.writingMode,
    direction: style.direction,
    transform: style.transform,
    zoom: style.getPropertyValue("zoom"),
  };
}
