import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { computeInverse, OperationSchema, type ResizeFlexPairOperation } from "./index.js";
import { arbByKind, arbOperation } from "./property-arbitraries/index.js";
import {
  flexPairOperation,
  reparentOperation,
  resizeOperation,
  styleEdit,
} from "./test-support/change-ir-fixtures.js";

const semanticPairState = (operation: ResizeFlexPairOperation) => ({
  target: operation.target,
  container: operation.container,
  members: operation.members,
  containerWitness: operation.containerWitness,
  witnesses: operation.witnesses,
  axis: operation.axis,
  delta: operation.delta,
});

describe("computeInverse", () => {
  it("produces schema-valid linked inverses for every generated operation", () => {
    fc.assert(
      fc.property(arbOperation, (operation) => {
        const inverse = computeInverse(operation);
        expect(OperationSchema.safeParse(inverse).success).toBe(true);
        expect(inverse.id).not.toBe(operation.id);
        expect(inverse.inverseOf).toBe(operation.id);
        expect(inverse.runtime).toBe(operation.runtime);
        expect(inverse.origin).toBe(operation.origin);
      }),
      { numRuns: 100 },
    );
  });

  it.each(Object.entries(arbByKind))("keeps %s inverses schema-valid", (_kind, arbitrary) => {
    fc.assert(
      fc.property(arbitrary, (operation) => {
        expect(OperationSchema.safeParse(computeInverse(operation)).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("preserves runtime preview semantics", () => {
    expect(computeInverse({ ...styleEdit(), runtime: true }).runtime).toBe(true);
  });

  it("swaps resize values", () => {
    const inverse = computeInverse(resizeOperation);
    if (inverse.kind !== "resize-element") throw new Error("expected resize-element inverse");
    expect({ fromValue: inverse.fromValue, toValue: inverse.toValue }).toEqual({
      fromValue: "320",
      toValue: "200",
    });
  });

  it("swaps reparent parents and indices", () => {
    const inverse = computeInverse(reparentOperation);
    if (inverse.kind !== "reparent-element") throw new Error("expected reparent inverse");
    expect({
      sourceParent: inverse.sourceParent.runtimeId,
      sourceIndex: inverse.sourceIndex,
      targetParent: inverse.targetParent.runtimeId,
      targetIndex: inverse.targetIndex,
    }).toEqual({
      sourceParent: "row-2",
      sourceIndex: 0,
      targetParent: "row-1",
      targetIndex: 1,
    });
  });

  it("swaps every pair state and negates the delta", () => {
    const operation = OperationSchema.parse(flexPairOperation());
    if (operation.kind !== "resize-flex-pair") throw new Error("expected pair operation");
    const inverse = computeInverse(operation);
    if (inverse.kind !== "resize-flex-pair") throw new Error("expected pair inverse");
    expect({
      primaryBefore: inverse.members[0].before,
      primaryAfter: inverse.members[0].after,
      neighborBefore: inverse.members[1].before,
      neighborAfter: inverse.members[1].after,
      containerBefore: inverse.containerWitness.before,
      containerAfter: inverse.containerWitness.after,
      witnessBefore: inverse.witnesses[0]?.before,
      witnessAfter: inverse.witnesses[0]?.after,
      delta: inverse.delta,
      inverseOf: inverse.inverseOf,
    }).toEqual({
      primaryBefore: operation.members[0].after,
      primaryAfter: operation.members[0].before,
      neighborBefore: operation.members[1].after,
      neighborAfter: operation.members[1].before,
      containerBefore: operation.containerWitness.after,
      containerAfter: operation.containerWitness.before,
      witnessBefore: operation.witnesses[0]?.after,
      witnessAfter: operation.witnesses[0]?.before,
      delta: -40,
      inverseOf: operation.id,
    });
  });

  it("restores every semantic pair field after two inversions", () => {
    const operation = OperationSchema.parse(flexPairOperation());
    if (operation.kind !== "resize-flex-pair") throw new Error("expected pair operation");
    const inverse = computeInverse(operation);
    const restored = computeInverse(inverse);
    if (restored.kind !== "resize-flex-pair") throw new Error("expected pair inverse");
    expect(semanticPairState(restored)).toEqual(semanticPairState(operation));
    expect(restored.inverseOf).toBe(inverse.id);
  });
});
