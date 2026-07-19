import * as fc from "fast-check";

import {
  arbBool,
  arbElementRef,
  arbIdent,
  arbNat,
  arbText,
  arbTimestamp,
  operationBase,
  parseOperation,
} from "./base.js";

const breakpointContext = {
  breakpoint: arbIdent,
  mediaSource: fc.option(arbIdent, { nil: undefined }),
  activeViewport: fc.option(arbIdent, { nil: undefined }),
  responsivePrefix: fc.option(arbIdent, { nil: undefined }),
  applyToBase: fc.option(arbBool, { nil: undefined }),
};
const arbBreakpointStyle = fc
  .record({
    ...operationBase,
    kind: fc.constant("breakpoint-style-edit"),
    target: arbElementRef,
    ...breakpointContext,
    property: arbIdent,
    value: arbText,
    important: arbBool,
    previousValue: arbText,
  })
  .map(parseOperation);
const arbBreakpointClass = fc
  .record({
    ...operationBase,
    kind: fc.constant("breakpoint-class-edit"),
    target: arbElementRef,
    ...breakpointContext,
    oldClassName: arbIdent,
    newClassName: arbIdent,
  })
  .map(parseOperation);
const arbBreakpointText = fc
  .record({
    ...operationBase,
    kind: fc.constant("breakpoint-text-edit"),
    target: arbElementRef,
    ...breakpointContext,
    newText: arbText,
    previousText: arbText,
  })
  .map(parseOperation);
const arbScreenshot = fc
  .record({
    ...operationBase,
    kind: fc.constant("screenshot-crop-ref"),
    target: arbElementRef,
    artifactId: arbIdent,
    captureRegion: fc.record({ x: arbNat, y: arbNat, width: arbNat, height: arbNat }),
    redactionReport: fc.option(arbIdent, { nil: undefined }),
    retentionExpiresAt: fc.option(arbTimestamp, { nil: undefined }),
  })
  .map(parseOperation);
const arbSuggestedDiff = fc
  .record({
    ...operationBase,
    kind: fc.constant("suggested-diff"),
    target: fc.option(arbElementRef, { nil: undefined }),
    diff: arbText,
    sourceRanges: fc.array(
      fc.record({ startLine: arbNat, startColumn: arbNat, endLine: arbNat, endColumn: arbNat }),
      { maxLength: 3 },
    ),
    confidence: fc.constantFrom("high", "medium", "low"),
    preconditions: fc.array(arbText, { maxLength: 3 }),
    applied: fc.constant(false),
  })
  .map(parseOperation);
const arbPseudoStyleEdit = fc
  .record({
    ...operationBase,
    kind: fc.constant("pseudo-style-edit"),
    target: arbElementRef,
    pseudoTarget: fc.constantFrom(
      "::before",
      "::after",
      ":hover",
      ":focus",
      ":active",
      ":disabled",
    ),
    property: arbIdent,
    value: arbText,
    important: arbBool,
    previousValue: arbText,
  })
  .map(parseOperation);

export const metadataArbitraries = {
  "breakpoint-style-edit": arbBreakpointStyle,
  "breakpoint-class-edit": arbBreakpointClass,
  "breakpoint-text-edit": arbBreakpointText,
  "screenshot-crop-ref": arbScreenshot,
  "suggested-diff": arbSuggestedDiff,
  "pseudo-style-edit": arbPseudoStyleEdit,
};
