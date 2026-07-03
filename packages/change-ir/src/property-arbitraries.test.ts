/**
 * fast-check arbitraries for the Change IR property tests (PRD §31.2).
 *
 * Co-located as a `.test.ts` file so `tsconfig.build.json` excludes it from the
 * shipped bundle while `tsconfig.json` (include: src) still type-checks it.
 * Imported by `index.test.ts`; the suite also runs the smoke tests below so the
 * generators themselves are proven to emit schema-valid operations.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type ChangeSet, ChangeSetSchema } from "./changeset.js";
import { type Operation, type OperationKind, OperationSchema } from "./operations/index.js";

// --- primitive arbitraries -------------------------------------------------

/** Matches {@link OPERATION_ID_PATTERN} (URL-safe, 8-128 chars). */
const arbSafeId = fc.stringMatching(/^[a-z0-9_-]{8,20}$/);
/** Non-empty element runtime id (z.string().min(1)). */
const arbRuntimeId = fc.stringMatching(/^[a-z][a-z0-9-]{2,15}$/);
/** CSS identifier-like string for class/property/unit/tag names. */
const arbIdent = fc.stringMatching(/^[a-z][a-z0-9-]{1,15}$/);
const arbNonEmpty = fc.stringMatching(/^[a-z0-9 _-]{1,20}$/);
const arbText = fc.string({ minLength: 0, maxLength: 40 });
const arbBool = fc.boolean();
const arbNat = fc.nat({ max: 50 });
const arbPosInt = fc.integer({ min: 1, max: 12 });
const arbTimestamp = fc.nat({ max: 4_000_000_000_000 });
const arbOrigin = fc.constantFrom("property-panel", "canvas-drag", "shortcut", "agent");
const arbConfidence = fc.float({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });
const arbElementRef = fc.record({
  runtimeId: arbRuntimeId,
  sourceId: fc.option(arbRuntimeId, { nil: undefined }),
  selector: fc.option(arbRuntimeId, { nil: undefined }),
});
const arbElementRefs1 = fc.uniqueArray(arbElementRef, { minLength: 1, maxLength: 4 });
const arbElementRefs2 = fc.uniqueArray(arbElementRef, { minLength: 2, maxLength: 4 });

/** Common OperationBase fields (kind + target supplied per-kind). */
const opBase = {
  id: arbSafeId,
  timestamp: arbTimestamp,
  runtime: arbBool,
  origin: arbOrigin,
  confidence: arbConfidence,
};

const parse =
  <T>(schema: { parse: (v: unknown) => T }) =>
  (raw: unknown): T =>
    schema.parse(raw);

// --- per-kind generators ---------------------------------------------------

const arbStyleEdit = fc
  .record({
    ...opBase,
    kind: fc.constant("style-edit"),
    target: arbElementRef,
    property: arbIdent,
    value: arbText,
    important: arbBool,
    previousValue: arbText,
  })
  .map(parse(OperationSchema));
const arbRemoveStyle = fc
  .record({
    ...opBase,
    kind: fc.constant("remove-style"),
    target: arbElementRef,
    property: arbIdent,
    previousValue: arbText,
    important: fc.option(arbBool, { nil: undefined }),
  })
  .map(parse(OperationSchema));
const arbClassAdd = fc
  .record({ ...opBase, kind: fc.constant("class-add"), target: arbElementRef, className: arbIdent })
  .map(parse(OperationSchema));
const arbClassRemove = fc
  .record({
    ...opBase,
    kind: fc.constant("class-remove"),
    target: arbElementRef,
    className: arbIdent,
  })
  .map(parse(OperationSchema));
const arbClassReplace = fc
  .record({
    ...opBase,
    kind: fc.constant("class-replace"),
    target: arbElementRef,
    oldClassName: arbIdent,
    newClassName: arbIdent,
  })
  .map(parse(OperationSchema));
const arbSetAttribute = fc
  .record({
    ...opBase,
    kind: fc.constant("set-attribute"),
    target: arbElementRef,
    name: arbIdent,
    value: arbText,
    previousValue: arbText,
  })
  .map(parse(OperationSchema));
const arbTextEdit = fc
  .record({
    ...opBase,
    kind: fc.constant("text-edit"),
    target: arbElementRef,
    newText: arbText,
    previousText: arbText,
  })
  .map(parse(OperationSchema));
const arbReorder = fc
  .record({
    ...opBase,
    kind: fc.constant("reorder-child"),
    target: fc.option(arbElementRef, { nil: undefined }),
    parent: arbElementRef,
    child: arbElementRef,
    fromIndex: arbNat,
    toIndex: arbNat,
  })
  .map(parse(OperationSchema));
const arbReparent = fc
  .record({
    ...opBase,
    kind: fc.constant("reparent-element"),
    target: fc.option(arbElementRef, { nil: undefined }),
    element: arbElementRef,
    sourceParent: arbElementRef,
    sourceIndex: arbNat,
    targetParent: arbElementRef,
    targetIndex: arbNat,
  })
  .map(parse(OperationSchema));
const arbPosition = fc
  .record({
    ...opBase,
    kind: fc.constant("position-element"),
    target: arbElementRef,
    property: fc.constant("position"),
    fromValue: arbIdent,
    toValue: arbIdent,
  })
  .map(parse(OperationSchema));
const arbResize = fc
  .record({
    ...opBase,
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
    ),
    fromValue: arbText,
    toValue: arbText,
    unit: fc.constantFrom("px", "%", "em", "rem", "fr"),
  })
  .map(parse(OperationSchema));
const arbMultiSelectGroup = fc
  .record({
    ...opBase,
    kind: fc.constant("multi-select-group"),
    target: fc.option(arbElementRef, { nil: undefined }),
    targets: arbElementRefs1,
    groupId: arbIdent,
    previousTargets: arbElementRefs1,
  })
  .map(parse(OperationSchema));
const arbGroupReorder = fc
  .record({
    ...opBase,
    kind: fc.constant("group-reorder"),
    target: fc.option(arbElementRef, { nil: undefined }),
    parent: arbElementRef,
    children: arbElementRefs2,
    previousOrder: fc.uniqueArray(arbNat, { minLength: 2, maxLength: 4 }),
    newOrder: fc.uniqueArray(arbNat, { minLength: 2, maxLength: 4 }),
  })
  .map(parse(OperationSchema));
const arbGroupReparent = fc
  .record({
    ...opBase,
    kind: fc.constant("group-reparent"),
    target: fc.option(arbElementRef, { nil: undefined }),
    elements: arbElementRefs1,
    sourceParent: arbElementRef,
    sourceIndices: fc.array(arbNat, { maxLength: 4 }),
    targetParent: arbElementRef,
    targetIndices: fc.array(arbNat, { maxLength: 4 }),
  })
  .map(parse(OperationSchema));
const arbAlign = fc
  .record({
    ...opBase,
    kind: fc.constant("align-elements"),
    target: fc.option(arbElementRef, { nil: undefined }),
    targets: arbElementRefs2,
    alignment: fc.constantFrom("left", "center", "right", "top", "middle", "bottom"),
    previousValues: fc.array(arbText, { maxLength: 4 }),
    newValues: fc.array(arbText, { maxLength: 4 }),
  })
  .map(parse(OperationSchema));
const arbDistribute = fc
  .record({
    ...opBase,
    kind: fc.constant("distribute-elements"),
    target: fc.option(arbElementRef, { nil: undefined }),
    targets: arbElementRefs2,
    axis: fc.constantFrom("horizontal", "vertical"),
    mode: fc.constantFrom("space-between", "space-around", "equal-gap"),
    previousGaps: fc.array(arbText, { maxLength: 4 }),
    newGaps: fc.array(arbText, { maxLength: 4 }),
  })
  .map(parse(OperationSchema));
const arbSetContainerLayout = fc
  .record({
    ...opBase,
    kind: fc.constant("set-container-layout"),
    target: fc.option(arbElementRef, { nil: undefined }),
    container: arbElementRef,
    property: arbIdent,
    value: arbText,
    previousValue: arbText,
  })
  .map(parse(OperationSchema));
const arbSetChildSizing = fc
  .record({
    ...opBase,
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
  .map(parse(OperationSchema));
const arbGridReorder = fc
  .record({
    ...opBase,
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
  .map(parse(OperationSchema));
const arbGridSpan = fc
  .record({
    ...opBase,
    kind: fc.constant("grid-span"),
    target: fc.option(arbElementRef, { nil: undefined }),
    grid: arbElementRef,
    child: arbElementRef,
    axis: fc.constantFrom("column", "row"),
    fromSpan: arbPosInt,
    toSpan: arbPosInt,
  })
  .map(parse(OperationSchema));
const arbInsert = fc
  .record({
    ...opBase,
    kind: fc.constant("insert-element"),
    target: fc.option(arbElementRef, { nil: undefined }),
    element: arbElementRef,
    parent: arbElementRef,
    index: arbNat,
    tagName: arbIdent,
    attributes: fc.option(fc.record({ role: arbNonEmpty }), { nil: undefined }),
  })
  .map(parse(OperationSchema));
const arbRemove = fc
  .record({
    ...opBase,
    kind: fc.constant("remove-element"),
    target: fc.option(arbElementRef, { nil: undefined }),
    element: arbElementRef,
    parent: arbElementRef,
    index: arbNat,
    tagName: arbIdent,
    attributes: fc.option(fc.record({ role: arbNonEmpty }), { nil: undefined }),
  })
  .map(parse(OperationSchema));
const arbDuplicate = fc
  .record({
    ...opBase,
    kind: fc.constant("duplicate-element"),
    target: fc.option(arbElementRef, { nil: undefined }),
    source: arbElementRef,
    duplicate: arbElementRef,
    parent: arbElementRef,
    index: arbNat,
    tagName: arbIdent,
  })
  .map(parse(OperationSchema));
const arbWrap = fc
  .record({
    ...opBase,
    kind: fc.constant("wrap-elements"),
    target: fc.option(arbElementRef, { nil: undefined }),
    targets: arbElementRefs1,
    wrapper: arbElementRef,
    parent: arbElementRef,
    tagName: arbIdent,
  })
  .map(parse(OperationSchema));
const arbUnwrap = fc
  .record({
    ...opBase,
    kind: fc.constant("unwrap-element"),
    target: fc.option(arbElementRef, { nil: undefined }),
    wrapper: arbElementRef,
    parent: arbElementRef,
    tagName: arbIdent,
    targets: arbElementRefs1,
  })
  .map(parse(OperationSchema));
const bpCtx = {
  breakpoint: arbIdent,
  mediaSource: fc.option(arbIdent, { nil: undefined }),
  activeViewport: fc.option(arbIdent, { nil: undefined }),
  responsivePrefix: fc.option(arbIdent, { nil: undefined }),
  applyToBase: fc.option(arbBool, { nil: undefined }),
};
const arbBpStyle = fc
  .record({
    ...opBase,
    kind: fc.constant("breakpoint-style-edit"),
    target: arbElementRef,
    ...bpCtx,
    property: arbIdent,
    value: arbText,
    important: arbBool,
    previousValue: arbText,
  })
  .map(parse(OperationSchema));
const arbBpClass = fc
  .record({
    ...opBase,
    kind: fc.constant("breakpoint-class-edit"),
    target: arbElementRef,
    ...bpCtx,
    oldClassName: arbIdent,
    newClassName: arbIdent,
  })
  .map(parse(OperationSchema));
const arbBpText = fc
  .record({
    ...opBase,
    kind: fc.constant("breakpoint-text-edit"),
    target: arbElementRef,
    ...bpCtx,
    newText: arbText,
    previousText: arbText,
  })
  .map(parse(OperationSchema));
const arbScreenshot = fc
  .record({
    ...opBase,
    kind: fc.constant("screenshot-crop-ref"),
    target: arbElementRef,
    artifactId: arbIdent,
    captureRegion: fc.record({ x: arbNat, y: arbNat, width: arbPosInt, height: arbPosInt }),
    redactionReport: fc.option(arbIdent, { nil: undefined }),
    retentionExpiresAt: fc.option(arbTimestamp, { nil: undefined }),
  })
  .map(parse(OperationSchema));
const arbSuggestedDiff = fc
  .record({
    ...opBase,
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
  .map(parse(OperationSchema));

/** Per-kind generator lookup (covers all 30 kinds in OPERATION_KINDS order). */
export const arbByKind: Record<OperationKind, fc.Arbitrary<Operation>> = {
  "style-edit": arbStyleEdit,
  "remove-style": arbRemoveStyle,
  "class-add": arbClassAdd,
  "class-remove": arbClassRemove,
  "class-replace": arbClassReplace,
  "set-attribute": arbSetAttribute,
  "text-edit": arbTextEdit,
  "reorder-child": arbReorder,
  "reparent-element": arbReparent,
  "position-element": arbPosition,
  "resize-element": arbResize,
  "multi-select-group": arbMultiSelectGroup,
  "group-reorder": arbGroupReorder,
  "group-reparent": arbGroupReparent,
  "align-elements": arbAlign,
  "distribute-elements": arbDistribute,
  "set-container-layout": arbSetContainerLayout,
  "set-child-sizing": arbSetChildSizing,
  "grid-reorder": arbGridReorder,
  "grid-span": arbGridSpan,
  "insert-element": arbInsert,
  "remove-element": arbRemove,
  "duplicate-element": arbDuplicate,
  "wrap-elements": arbWrap,
  "unwrap-element": arbUnwrap,
  "breakpoint-style-edit": arbBpStyle,
  "breakpoint-class-edit": arbBpClass,
  "breakpoint-text-edit": arbBpText,
  "screenshot-crop-ref": arbScreenshot,
  "suggested-diff": arbSuggestedDiff,
};

/** Arbitrary operation of ANY kind (uniform over all 30). */
export const arbOperation = fc.oneof(...Object.values(arbByKind));

// --- changeset generator ---------------------------------------------------

export const arbChangeSet: fc.Arbitrary<ChangeSet> = fc
  .record({
    schemaVersion: fc.constant("2.0.0"),
    id: arbSafeId,
    workspaceId: arbIdent,
    sessionId: arbSafeId,
    page: fc.record({
      url: fc.webUrl(),
      title: fc.oneof(fc.string({ maxLength: 20 }), fc.constant(null)),
    }),
    viewport: fc.record({ width: arbNat, height: arbNat }),
    createdAt: arbTimestamp,
    updatedAt: arbTimestamp,
    title: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    userInstruction: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    selectedTargets: fc.uniqueArray(arbElementRef, { maxLength: 3 }),
    operations: fc.array(arbOperation, { maxLength: 4 }),
    sourceResolutions: fc.constant([]),
    verificationPlan: fc.record({
      assertions: fc.constant([]),
      notes: fc.string({ maxLength: 20 }),
    }),
    privacyReport: fc.record({
      redactions: fc.constant([]),
      totalRedacted: arbNat,
      note: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    }),
    committed: arbBool,
    supersededBy: fc.option(arbSafeId, { nil: undefined }),
  })
  .map(parse(ChangeSetSchema));

// --- smoke test: every generator emits schema-valid operations ------------

describe("property arbitraries (smoke)", () => {
  it.each(Object.keys(arbByKind) as OperationKind[])("generates schema-valid %s", (kind) => {
    fc.assert(
      fc.property(arbByKind[kind], (op) => OperationSchema.safeParse(op).success),
      { numRuns: 20 },
    );
  });

  it("arbOperation emits schema-valid ops across all kinds", () => {
    const seen = new Set<OperationKind>();
    fc.assert(
      fc.property(arbOperation, (op) => {
        seen.add(op.kind);
        return OperationSchema.safeParse(op).success;
      }),
      { numRuns: 200 },
    );
    // Ensure the uniform generator exercised every kind at least once.
    expect(seen.size).toBe(Object.keys(arbByKind).length);
  });

  it("arbChangeSet emits schema-valid changesets", () => {
    fc.assert(
      fc.property(arbChangeSet, (cs) => ChangeSetSchema.safeParse(cs).success),
      { numRuns: 20 },
    );
  });
});
