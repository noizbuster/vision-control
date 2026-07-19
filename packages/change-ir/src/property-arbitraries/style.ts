import * as fc from "fast-check";

import {
  arbBool,
  arbElementRef,
  arbIdent,
  arbNat,
  arbText,
  operationBase,
  parseOperation,
} from "./base.js";

const arbStyleEdit = fc
  .record({
    ...operationBase,
    kind: fc.constant("style-edit"),
    target: arbElementRef,
    property: arbIdent,
    value: arbText,
    important: arbBool,
    previousValue: arbText,
  })
  .map(parseOperation);
const arbRemoveStyle = fc
  .record({
    ...operationBase,
    kind: fc.constant("remove-style"),
    target: arbElementRef,
    property: arbIdent,
    previousValue: arbText,
    important: fc.option(arbBool, { nil: undefined }),
  })
  .map(parseOperation);
const arbClassAdd = fc
  .record({
    ...operationBase,
    kind: fc.constant("class-add"),
    target: arbElementRef,
    className: arbIdent,
  })
  .map(parseOperation);
const arbClassRemove = fc
  .record({
    ...operationBase,
    kind: fc.constant("class-remove"),
    target: arbElementRef,
    className: arbIdent,
  })
  .map(parseOperation);
const arbClassReplace = fc
  .record({
    ...operationBase,
    kind: fc.constant("class-replace"),
    target: arbElementRef,
    oldClassName: arbIdent,
    newClassName: arbIdent,
  })
  .map(parseOperation);
const arbSetAttribute = fc
  .record({
    ...operationBase,
    kind: fc.constant("set-attribute"),
    target: arbElementRef,
    name: arbIdent,
    value: arbText,
    previousValue: arbText,
  })
  .map(parseOperation);
const arbSetComponentProp = fc
  .record({
    ...operationBase,
    kind: fc.constant("set-component-prop"),
    target: arbElementRef,
    componentName: arbIdent,
    propName: arbIdent,
    value: arbText,
    previousValue: arbText,
    sourceRange: fc.record({
      startLine: arbNat,
      startColumn: arbNat,
      endLine: arbNat,
      endColumn: arbNat,
    }),
  })
  .map(parseOperation);
const arbTextEdit = fc
  .record({
    ...operationBase,
    kind: fc.constant("text-edit"),
    target: arbElementRef,
    newText: arbText,
    previousText: arbText,
  })
  .map(parseOperation);
const arbPosition = fc
  .record({
    ...operationBase,
    kind: fc.constant("position-element"),
    target: arbElementRef,
    property: fc.constant("position"),
    fromValue: arbIdent,
    toValue: arbIdent,
  })
  .map(parseOperation);
const arbResize = fc
  .record({
    ...operationBase,
    kind: fc.constant("resize-element"),
    target: fc.option(arbElementRef, { nil: undefined }),
    element: arbElementRef,
    property: fc.constantFrom(
      "width",
      "height",
      "flex-basis",
      "flex-grow",
      "flex-shrink",
      "min-width",
      "min-height",
      "max-width",
      "max-height",
      "aspect-ratio",
      "align-self",
    ),
    fromValue: arbText,
    toValue: arbText,
    unit: fc.constantFrom("px", "%", "em", "rem", "fr"),
  })
  .map(parseOperation);

export const styleArbitraries = {
  "style-edit": arbStyleEdit,
  "remove-style": arbRemoveStyle,
  "class-add": arbClassAdd,
  "class-remove": arbClassRemove,
  "class-replace": arbClassReplace,
  "set-attribute": arbSetAttribute,
  "set-component-prop": arbSetComponentProp,
  "text-edit": arbTextEdit,
  "position-element": arbPosition,
  "resize-element": arbResize,
};
