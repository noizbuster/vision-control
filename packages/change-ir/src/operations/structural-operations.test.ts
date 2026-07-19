import { describe, expect, it } from "vitest";

import {
  computeInverse,
  deserializeChangeSet,
  OperationSchema,
  serializeChangeSet,
} from "../index.js";
import {
  changeSetWith,
  duplicateOperation,
  insertOperation,
  removeElementOperation,
  unwrapOperation,
  wrapOperation,
} from "../test-support/change-ir-fixtures.js";

const STRUCTURAL_OPERATIONS = [
  insertOperation("new-node-1"),
  removeElementOperation("old-node-1"),
  duplicateOperation("card-a", "card-a-copy"),
  wrapOperation("wrapper-1"),
  unwrapOperation("wrapper-2"),
] as const;

describe("structural operation schemas and inverses", () => {
  it.each(STRUCTURAL_OPERATIONS)("accepts and inverts $kind", (operation) => {
    const inverse = computeInverse(operation);
    expect(OperationSchema.safeParse(operation).success).toBe(true);
    expect(OperationSchema.safeParse(inverse).success).toBe(true);
    expect(inverse.inverseOf).toBe(operation.id);
  });

  it.each([
    ["insert/remove", insertOperation("new-node-1"), "remove-element"],
    ["remove/insert", removeElementOperation("old-node-1"), "insert-element"],
    ["duplicate/remove", duplicateOperation("card-a", "card-a-copy"), "remove-element"],
    ["wrap/unwrap", wrapOperation("wrapper-1"), "unwrap-element"],
    ["unwrap/wrap", unwrapOperation("wrapper-2"), "wrap-elements"],
  ])("maps $0 to its literal inverse kind", (_name, operation, inverseKind) => {
    expect(computeInverse(operation).kind).toBe(inverseKind);
  });

  it("rejects malformed structural fields", () => {
    expect(OperationSchema.safeParse({ ...insertOperation("node"), index: -1 }).success).toBe(
      false,
    );
    expect(OperationSchema.safeParse({ ...wrapOperation("wrapper"), targets: [] }).success).toBe(
      false,
    );
  });

  it("restores self-symmetric structural shapes after two inversions", () => {
    for (const operation of [
      insertOperation("new-node-1"),
      removeElementOperation("old-node-1"),
      wrapOperation("wrapper-1"),
      unwrapOperation("wrapper-2"),
    ]) {
      const restored = computeInverse(computeInverse(operation));
      expect(restored.kind).toBe(operation.kind);
    }
  });
});

describe("structural serialization", () => {
  it("round-trips a canonical structural changeset", () => {
    const changeSet = changeSetWith("cs-structrt0001", STRUCTURAL_OPERATIONS);
    const serialized = serializeChangeSet(changeSet);
    const result = deserializeChangeSet(serialized);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(changeSet);
      expect(serializeChangeSet(result.data)).toBe(serialized);
      const restoredRemove = result.data.operations[1];
      const restoredUnwrap = result.data.operations[4];
      if (restoredRemove?.kind !== "remove-element" || restoredUnwrap?.kind !== "unwrap-element") {
        throw new Error("expected serialized structural operations");
      }
      expect({ index: restoredRemove.index, tagName: restoredRemove.tagName }).toEqual({
        index: 2,
        tagName: "span",
      });
      expect(restoredUnwrap.tagName).toBe("section");
    }
  });

  it("rejects serialized structural operations missing required identity", () => {
    const malformed = {
      ...changeSetWith("cs-struct-invalid", []),
      operations: [
        {
          id: "op-insert-invalid",
          timestamp: 1_700_000_000_000,
          runtime: false,
          origin: "property-panel",
          confidence: 1,
          kind: "insert-element",
          element: { runtimeId: "node" },
          index: 0,
          tagName: "div",
        },
      ],
    };
    expect(deserializeChangeSet(JSON.stringify(malformed)).success).toBe(false);
  });
});
