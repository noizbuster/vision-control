import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { computeInverse, OperationSchema } from "../index.js";
import { arbByKind } from "./index.js";

describe("resize-flex-pair arbitrary", () => {
  it("generates valid pairs whose double inverse restores semantic data", () => {
    fc.assert(
      fc.property(arbByKind["resize-flex-pair"], (operation) => {
        const inverse = computeInverse(operation);
        const restored = computeInverse(inverse);
        expect(OperationSchema.safeParse(inverse).success).toBe(true);
        expect(restored.kind).toBe("resize-flex-pair");
        if (operation.kind !== "resize-flex-pair" || restored.kind !== "resize-flex-pair") {
          return false;
        }
        return (
          JSON.stringify({
            target: restored.target,
            container: restored.container,
            members: restored.members,
            containerWitness: restored.containerWitness,
            witnesses: restored.witnesses,
            axis: restored.axis,
            delta: restored.delta,
          }) ===
          JSON.stringify({
            target: operation.target,
            container: operation.container,
            members: operation.members,
            containerWitness: operation.containerWitness,
            witnesses: operation.witnesses,
            axis: operation.axis,
            delta: operation.delta,
          })
        );
      }),
      { numRuns: 100 },
    );
  });
});
