import { describe, expect, it } from "vitest";

import {
  computeInverse,
  deserializeChangeSet,
  OperationSchema,
  serializeChangeSet,
} from "../index.js";
import { changeSetWith, elementRef } from "../test-support/change-ir-fixtures.js";
import {
  alignElements,
  breakpointClassEdit,
  breakpointStyleEdit,
  gridReorder,
  gridSpan,
  groupReorder,
  groupReparent,
  multiSelectGroup,
  pseudoStyleEdit,
  screenshotCropRef,
  setContainerLayout,
  suggestedDiff,
  V1_OPERATIONS,
} from "../test-support/v1-operation-fixtures.js";

describe("V1 literal operation characterization", () => {
  it.each(V1_OPERATIONS)("accepts and inverts $kind", (operation) => {
    expect(OperationSchema.safeParse(operation).success).toBe(true);
    expect(OperationSchema.safeParse(computeInverse(operation)).success).toBe(true);
  });

  it("rejects every historically malformed literal", () => {
    const { artifactId: _artifact, ...missingArtifact } = screenshotCropRef;
    const { diff: _diff, ...missingDiff } = suggestedDiff;
    expect(
      OperationSchema.safeParse({ ...groupReorder, children: [elementRef("card-a")] }).success,
    ).toBe(false);
    expect(OperationSchema.safeParse({ ...gridSpan, toSpan: 0 }).success).toBe(false);
    expect(OperationSchema.safeParse(missingArtifact).success).toBe(false);
    expect(OperationSchema.safeParse(missingDiff).success).toBe(false);
    expect(OperationSchema.safeParse({ ...alignElements, alignment: "diagonal" }).success).toBe(
      false,
    );
  });

  it("swaps multi-selection targets and group ordering", () => {
    const selection = computeInverse(multiSelectGroup);
    const ordering = computeInverse(groupReorder);
    if (selection.kind !== "multi-select-group" || ordering.kind !== "group-reorder") {
      throw new Error("expected group inverses");
    }
    expect(selection.targets).toEqual([elementRef("card-a")]);
    expect(selection.previousTargets).toEqual([
      elementRef("card-a"),
      elementRef("card-b"),
      elementRef("card-c"),
    ]);
    expect(ordering.previousOrder).toEqual([2, 0, 1]);
    expect(ordering.newOrder).toEqual([0, 1, 2]);
  });

  it("swaps group parents and container values", () => {
    const reparent = computeInverse(groupReparent);
    const layout = computeInverse(setContainerLayout);
    if (reparent.kind !== "group-reparent" || layout.kind !== "set-container-layout") {
      throw new Error("expected layout inverses");
    }
    expect({
      source: reparent.sourceParent.runtimeId,
      target: reparent.targetParent.runtimeId,
    }).toEqual({ source: "row-2", target: "row-1" });
    expect({ value: layout.value, previousValue: layout.previousValue }).toEqual({
      value: "row",
      previousValue: "column",
    });
  });

  it("swaps every literal grid placement field", () => {
    const reorder = computeInverse(gridReorder);
    const span = computeInverse(gridSpan);
    if (reorder.kind !== "grid-reorder" || span.kind !== "grid-span")
      throw new Error("expected grid inverses");
    expect({
      fromIndex: reorder.fromIndex,
      toIndex: reorder.toIndex,
      previousGridArea: reorder.previousGridArea,
      newGridArea: reorder.newGridArea,
      placement: reorder.placement,
    }).toEqual({
      fromIndex: 0,
      toIndex: 2,
      previousGridArea: "1 / 1",
      newGridArea: "1 / 3",
      placement: "grid-area",
    });
    expect({ fromSpan: span.fromSpan, toSpan: span.toSpan }).toEqual({ fromSpan: 2, toSpan: 1 });
  });

  it("preserves breakpoint metadata while swapping values", () => {
    const style = computeInverse(breakpointStyleEdit);
    const classEdit = computeInverse(breakpointClassEdit);
    if (style.kind !== "breakpoint-style-edit" || classEdit.kind !== "breakpoint-class-edit")
      throw new Error("expected breakpoint inverses");
    expect({
      breakpoint: style.breakpoint,
      value: style.value,
      previousValue: style.previousValue,
      mediaSource: style.mediaSource,
    }).toEqual({
      breakpoint: "md",
      value: "8px",
      previousValue: "16px",
      mediaSource: "@media (min-width: 768px)",
    });
    expect({ oldClassName: classEdit.oldClassName, newClassName: classEdit.newClassName }).toEqual({
      oldClassName: "p-4",
      newClassName: "p-2",
    });
  });

  it("preserves inert marker payloads", () => {
    const screenshot = computeInverse(screenshotCropRef);
    const diff = computeInverse(suggestedDiff);
    if (screenshot.kind !== "screenshot-crop-ref" || diff.kind !== "suggested-diff")
      throw new Error("expected marker inverses");
    expect({ artifactId: screenshot.artifactId, captureRegion: screenshot.captureRegion }).toEqual({
      artifactId: "shot-art-0001",
      captureRegion: { x: 0, y: 0, width: 200, height: 80 },
    });
    expect({ applied: diff.applied, diff: diff.diff }).toEqual({
      applied: false,
      diff: suggestedDiff.diff,
    });
  });

  it("round-trips pseudo style semantics through two inversions", () => {
    const inverse = computeInverse(pseudoStyleEdit);
    const restored = computeInverse(inverse);
    if (inverse.kind !== "pseudo-style-edit" || restored.kind !== "pseudo-style-edit")
      throw new Error("expected pseudo inverses");
    expect({
      value: inverse.value,
      previousValue: inverse.previousValue,
      pseudoTarget: inverse.pseudoTarget,
      property: inverse.property,
      important: inverse.important,
      target: inverse.target.runtimeId,
    }).toEqual({
      value: '"OLD"',
      previousValue: '"NEW"',
      pseudoTarget: "::before",
      property: "content",
      important: false,
      target: "card-a",
    });
    expect({
      value: restored.value,
      previousValue: restored.previousValue,
      pseudoTarget: restored.pseudoTarget,
    }).toEqual({
      value: pseudoStyleEdit.value,
      previousValue: pseudoStyleEdit.previousValue,
      pseudoTarget: pseudoStyleEdit.pseudoTarget,
    });
  });

  it("round-trips a changeset containing every V1 kind", () => {
    const changeSet = changeSetWith("cs-allv1kind0001", V1_OPERATIONS);
    const result = deserializeChangeSet(serializeChangeSet(changeSet));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(changeSet);
  });
});
