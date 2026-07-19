import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ChangeSetSchema, OPERATION_KINDS, OperationSchema } from "../index.js";
import { arbByKind, arbChangeSet, arbOperation } from "./index.js";

describe("property arbitrary core", () => {
  it("registers every literal operation kind", () => {
    expect(new Set(Object.keys(arbByKind))).toEqual(new Set(OPERATION_KINDS));
  });

  it("keeps aggregate operations schema-valid across repeated runs", () => {
    fc.assert(
      fc.property(arbOperation, (operation) => OperationSchema.safeParse(operation).success),
      { numRuns: 500 },
    );
  });

  it("keeps generated changesets canonical and schema-valid", () => {
    fc.assert(
      fc.property(arbChangeSet, (changeSet) => {
        const result = ChangeSetSchema.safeParse(changeSet);
        return result.success && result.data.schemaVersion === "2.1.0";
      }),
      { numRuns: 100 },
    );
  });
});
