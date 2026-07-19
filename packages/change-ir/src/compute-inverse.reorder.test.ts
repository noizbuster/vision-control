import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { computeInverse, type ReorderChildOperation } from "./index.js";
import {
  BASE_TIME,
  elementRef,
  operationDefaults,
  reorderOperation,
} from "./test-support/change-ir-fixtures.js";

const applyReorder = (children: readonly string[], operation: ReorderChildOperation): string[] => {
  const next = [...children];
  const [moved] = next.splice(operation.fromIndex, 1);
  if (moved === undefined) return next;
  next.splice(operation.toIndex, 0, moved);
  return next;
};

const arbReorderSequence = fc.integer({ min: 2, max: 8 }).chain((length) =>
  fc.record({
    original: fc.constant(Array.from({ length }, (_, index) => `e${index}`)),
    pairs: fc.array(
      fc.record({
        from: fc.integer({ min: 0, max: length - 1 }),
        to: fc.integer({ min: 0, max: length - 1 }),
      }),
      { minLength: 1, maxLength: 5 },
    ),
  }),
);

const toOperation = (
  pair: { readonly from: number; readonly to: number },
  index: number,
): ReorderChildOperation => ({
  id: `op-reorder-${pair.from}-${pair.to}-${index}`,
  timestamp: BASE_TIME,
  runtime: false,
  ...operationDefaults,
  kind: "reorder-child",
  parent: elementRef("row-1"),
  child: elementRef(`child-${pair.from}`),
  fromIndex: pair.from,
  toIndex: pair.to,
});

describe("reorder inverse", () => {
  it("restores a literal 2-to-0 reorder", () => {
    const original = ["a", "b", "c", "d"];
    const moved = applyReorder(original, reorderOperation);
    const inverse = computeInverse(reorderOperation);
    if (inverse.kind !== "reorder-child") throw new Error("expected reorder inverse");
    expect(moved).toEqual(["c", "a", "b", "d"]);
    expect({ fromIndex: inverse.fromIndex, toIndex: inverse.toIndex }).toEqual({
      fromIndex: 0,
      toIndex: 2,
    });
    expect(applyReorder(moved, inverse)).toEqual(original);
  });

  it("restores every generated reorder sequence in reverse inverse order", () => {
    fc.assert(
      fc.property(arbReorderSequence, ({ original, pairs }) => {
        const operations = pairs.map(toOperation);
        let state = [...original];
        for (const operation of operations) state = applyReorder(state, operation);
        for (const operation of [...operations].reverse()) {
          const inverse = computeInverse(operation);
          if (inverse.kind !== "reorder-child") return false;
          state = applyReorder(state, inverse);
        }
        return JSON.stringify(state) === JSON.stringify(original);
      }),
      { numRuns: 100 },
    );
  });

  it("catches a deliberately wrong unswapped inverse", () => {
    expect(() =>
      fc.assert(
        fc.property(arbReorderSequence, ({ original, pairs }) => {
          const operations = pairs.map(toOperation);
          let state = [...original];
          for (const operation of operations) state = applyReorder(state, operation);
          for (const operation of [...operations].reverse()) {
            state = applyReorder(state, operation);
          }
          expect(state).toEqual(original);
        }),
        { numRuns: 100 },
      ),
    ).toThrow();
  });
});
