import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  computeInverse,
  deserializeChangeSet,
  OPERATION_KINDS,
  OperationSchema,
  serializeChangeSet,
} from "../index.js";
import { arbByKind } from "../property-arbitraries.test.js";
import { BASE_TIME, changeSetWith, styleEdit } from "../test-support/change-ir-fixtures.js";

describe("operation registry compatibility", () => {
  it("keeps the compatibility arbitrary barrel exhaustive", () => {
    expect(new Set(Object.keys(arbByKind))).toEqual(new Set(OPERATION_KINDS));
    expect(new Set(OPERATION_KINDS).size).toBe(OPERATION_KINDS.length);
  });

  it.each(OPERATION_KINDS)("generates valid %s operations and inverses", (kind) => {
    fc.assert(
      fc.property(arbByKind[kind], (operation) => {
        const inverse = computeInverse(operation);
        expect(OperationSchema.safeParse(operation).success).toBe(true);
        expect(OperationSchema.safeParse(inverse).success).toBe(true);
        expect(inverse.inverseOf).toBe(operation.id);
        expect(inverse.runtime).toBe(operation.runtime);
      }),
      { numRuns: 25 },
    );
  });
});

describe("legacy operation serialization compatibility", () => {
  it("canonicalizes a mixed 2.0.0 changeset to byte-stable 2.1.0", () => {
    const legacy = changeSetWith("cs-v1roundtrip01", [styleEdit()]);
    const stale = { ...legacy, schemaVersion: "2.0.0" as const };
    const serialized = serializeChangeSet(stale);
    const result = deserializeChangeSet(serialized);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ ...stale, schemaVersion: "2.1.0" });
      expect(serializeChangeSet(result.data)).toBe(serialized);
    }
  });

  it("rejects a stale operation missing a required field", () => {
    const stale = {
      ...changeSetWith("cs-v1-invalid001", []),
      operations: [
        {
          id: "op-msel-grp001",
          timestamp: BASE_TIME,
          runtime: false,
          origin: "property-panel",
          confidence: 1,
          kind: "multi-select-group",
          groupId: "group-1",
        },
      ],
    };
    expect(deserializeChangeSet(JSON.stringify(stale)).success).toBe(false);
  });

  it.each([
    "{broken",
    JSON.stringify({ id: "x" }),
  ])("never throws for malformed serialized input %s", (input) => {
    expect(deserializeChangeSet(input).success).toBe(false);
  });
});
