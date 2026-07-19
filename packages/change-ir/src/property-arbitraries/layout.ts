import * as fc from "fast-check";

import {
  arbElementRef,
  arbElementRefs1,
  arbElementRefs2,
  arbIdent,
  arbNat,
  arbNonEmpty,
  arbPosInt,
  arbText,
  operationBase,
  parseOperation,
} from "./base.js";

const primaryRef = {
  runtimeId: "pair-primary",
  selector: ".card",
  occurrence: 0,
  fingerprint: "fingerprint-pair-primary",
};
const neighborRef = {
  runtimeId: "pair-neighbor",
  selector: ".card",
  occurrence: 1,
  fingerprint: "fingerprint-pair-neighbor",
};
const containerRef = {
  runtimeId: "pair-container",
  selector: ".row",
  occurrence: 0,
  fingerprint: "fingerprint-pair-container",
};
const witnessRef = {
  runtimeId: "pair-witness",
  selector: ".card",
  occurrence: 2,
  fingerprint: "fingerprint-pair-witness",
};
const arbFlexState = fc.record({
  flex: fc.record({
    flexGrow: arbNonEmpty,
    flexShrink: arbNonEmpty,
    flexBasis: arbNonEmpty,
  }),
  usedMainSize: fc.float({ min: 0, max: 2_000, noNaN: true, noDefaultInfinity: true }),
});
const arbRect = fc.record({
  x: fc.float({ noNaN: true, noDefaultInfinity: true }),
  y: fc.float({ noNaN: true, noDefaultInfinity: true }),
  width: fc.float({ min: 0, max: 2_000, noNaN: true, noDefaultInfinity: true }),
  height: fc.float({ min: 0, max: 2_000, noNaN: true, noDefaultInfinity: true }),
});
const arbFlexPair = fc
  .record({
    ...operationBase,
    kind: fc.constant("resize-flex-pair"),
    target: fc.constant(primaryRef),
    container: fc.constant(containerRef),
    members: fc.tuple(
      fc.record({
        role: fc.constant("primary"),
        element: fc.constant(primaryRef),
        before: arbFlexState,
        after: arbFlexState,
      }),
      fc.record({
        role: fc.constant("neighbor"),
        element: fc.constant(neighborRef),
        before: arbFlexState,
        after: arbFlexState,
      }),
    ),
    containerWitness: fc.record({ before: arbRect, after: arbRect }),
    witnesses: fc.tuple(
      fc.record({ element: fc.constant(witnessRef), before: arbRect, after: arbRect }),
    ),
    axis: fc.constant({
      writingMode: "horizontal-tb",
      direction: "ltr",
      flexDirection: "row",
      logicalAxis: "inline",
      physicalAxis: "x",
      directionSign: 1,
      handleBoundary: "main-end",
    }),
    delta: fc.float({ noNaN: true, noDefaultInfinity: true }),
  })
  .map(parseOperation);
const arbMultiSelectGroup = fc
  .record({
    ...operationBase,
    kind: fc.constant("multi-select-group"),
    target: fc.option(arbElementRef, { nil: undefined }),
    targets: arbElementRefs1,
    groupId: arbIdent,
    previousTargets: arbElementRefs1,
  })
  .map(parseOperation);
const arbGroupReorder = fc
  .record({
    ...operationBase,
    kind: fc.constant("group-reorder"),
    target: fc.option(arbElementRef, { nil: undefined }),
    parent: arbElementRef,
    children: arbElementRefs2,
    previousOrder: fc.uniqueArray(arbNat, { minLength: 2, maxLength: 4 }),
    newOrder: fc.uniqueArray(arbNat, { minLength: 2, maxLength: 4 }),
  })
  .map(parseOperation);
const arbGroupReparent = fc
  .record({
    ...operationBase,
    kind: fc.constant("group-reparent"),
    target: fc.option(arbElementRef, { nil: undefined }),
    elements: arbElementRefs1,
    sourceParent: arbElementRef,
    sourceIndices: fc.array(arbNat, { maxLength: 4 }),
    targetParent: arbElementRef,
    targetIndices: fc.array(arbNat, { maxLength: 4 }),
  })
  .map(parseOperation);
const arbAlign = fc
  .record({
    ...operationBase,
    kind: fc.constant("align-elements"),
    target: fc.option(arbElementRef, { nil: undefined }),
    targets: arbElementRefs2,
    alignment: fc.constantFrom("left", "center", "right", "top", "middle", "bottom"),
    previousValues: fc.array(arbText, { maxLength: 4 }),
    newValues: fc.array(arbText, { maxLength: 4 }),
  })
  .map(parseOperation);
const arbDistribute = fc
  .record({
    ...operationBase,
    kind: fc.constant("distribute-elements"),
    target: fc.option(arbElementRef, { nil: undefined }),
    targets: arbElementRefs2,
    axis: fc.constantFrom("horizontal", "vertical"),
    mode: fc.constantFrom("space-between", "space-around", "equal-gap"),
    previousGaps: fc.array(arbText, { maxLength: 4 }),
    newGaps: fc.array(arbText, { maxLength: 4 }),
  })
  .map(parseOperation);
const arbSetContainerLayout = fc
  .record({
    ...operationBase,
    kind: fc.constant("set-container-layout"),
    target: fc.option(arbElementRef, { nil: undefined }),
    container: arbElementRef,
    property: arbIdent,
    value: arbText,
    previousValue: arbText,
  })
  .map(parseOperation);
const arbSetChildSizing = fc
  .record({
    ...operationBase,
    kind: fc.constant("set-child-sizing"),
    target: fc.option(arbElementRef, { nil: undefined }),
    container: arbElementRef,
    childIndex: arbNat,
    child: arbElementRef,
    sizing: fc.constantFrom("hug", "fill", "fixed"),
    previousSizing: fc.constantFrom("hug", "fill", "fixed"),
    value: fc.option(arbText, { nil: undefined }),
    previousValue: fc.option(arbText, { nil: undefined }),
  })
  .map(parseOperation);
const arbGridReorder = fc
  .record({
    ...operationBase,
    kind: fc.constant("grid-reorder"),
    target: fc.option(arbElementRef, { nil: undefined }),
    grid: arbElementRef,
    child: arbElementRef,
    placement: fc.constantFrom("dom-order", "grid-area"),
    fromIndex: arbNat,
    toIndex: arbNat,
    previousGridArea: fc.option(arbIdent, { nil: undefined }),
    newGridArea: fc.option(arbIdent, { nil: undefined }),
  })
  .map(parseOperation);
const arbGridSpan = fc
  .record({
    ...operationBase,
    kind: fc.constant("grid-span"),
    target: fc.option(arbElementRef, { nil: undefined }),
    grid: arbElementRef,
    child: arbElementRef,
    axis: fc.constantFrom("column", "row"),
    fromSpan: arbPosInt,
    toSpan: arbPosInt,
  })
  .map(parseOperation);

export const layoutArbitraries = {
  "resize-flex-pair": arbFlexPair,
  "multi-select-group": arbMultiSelectGroup,
  "group-reorder": arbGroupReorder,
  "group-reparent": arbGroupReparent,
  "align-elements": arbAlign,
  "distribute-elements": arbDistribute,
  "set-container-layout": arbSetContainerLayout,
  "set-child-sizing": arbSetChildSizing,
  "grid-reorder": arbGridReorder,
  "grid-span": arbGridSpan,
};
