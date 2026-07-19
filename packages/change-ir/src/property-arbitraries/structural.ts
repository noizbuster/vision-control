import * as fc from "fast-check";

import {
  arbElementRef,
  arbElementRefs1,
  arbIdent,
  arbNat,
  arbNonEmpty,
  operationBase,
  parseOperation,
} from "./base.js";

const arbReorder = fc
  .record({
    ...operationBase,
    kind: fc.constant("reorder-child"),
    target: fc.option(arbElementRef, { nil: undefined }),
    parent: arbElementRef,
    child: arbElementRef,
    fromIndex: arbNat,
    toIndex: arbNat,
  })
  .map(parseOperation);
const arbReparent = fc
  .record({
    ...operationBase,
    kind: fc.constant("reparent-element"),
    target: fc.option(arbElementRef, { nil: undefined }),
    element: arbElementRef,
    sourceParent: arbElementRef,
    sourceIndex: arbNat,
    targetParent: arbElementRef,
    targetIndex: arbNat,
  })
  .map(parseOperation);
const arbInsert = fc
  .record({
    ...operationBase,
    kind: fc.constant("insert-element"),
    target: fc.option(arbElementRef, { nil: undefined }),
    element: arbElementRef,
    parent: arbElementRef,
    index: arbNat,
    tagName: arbIdent,
    attributes: fc.option(fc.record({ role: arbNonEmpty }), { nil: undefined }),
  })
  .map(parseOperation);
const arbRemove = fc
  .record({
    ...operationBase,
    kind: fc.constant("remove-element"),
    target: fc.option(arbElementRef, { nil: undefined }),
    element: arbElementRef,
    parent: arbElementRef,
    index: arbNat,
    tagName: arbIdent,
    attributes: fc.option(fc.record({ role: arbNonEmpty }), { nil: undefined }),
  })
  .map(parseOperation);
const arbDuplicate = fc
  .record({
    ...operationBase,
    kind: fc.constant("duplicate-element"),
    target: fc.option(arbElementRef, { nil: undefined }),
    source: arbElementRef,
    duplicate: arbElementRef,
    parent: arbElementRef,
    index: arbNat,
    tagName: arbIdent,
  })
  .map(parseOperation);
const arbWrap = fc
  .record({
    ...operationBase,
    kind: fc.constant("wrap-elements"),
    target: fc.option(arbElementRef, { nil: undefined }),
    targets: arbElementRefs1,
    wrapper: arbElementRef,
    parent: arbElementRef,
    tagName: arbIdent,
  })
  .map(parseOperation);
const arbUnwrap = fc
  .record({
    ...operationBase,
    kind: fc.constant("unwrap-element"),
    target: fc.option(arbElementRef, { nil: undefined }),
    wrapper: arbElementRef,
    parent: arbElementRef,
    tagName: arbIdent,
    targets: arbElementRefs1,
  })
  .map(parseOperation);

export const structuralArbitraries = {
  "reorder-child": arbReorder,
  "reparent-element": arbReparent,
  "insert-element": arbInsert,
  "remove-element": arbRemove,
  "duplicate-element": arbDuplicate,
  "wrap-elements": arbWrap,
  "unwrap-element": arbUnwrap,
};
