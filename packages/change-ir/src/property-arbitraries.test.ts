import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ChangeSetSchema } from "./changeset.js";
import { OPERATION_KINDS, OperationSchema } from "./operations/index.js";
import { arbByKind, arbChangeSet, arbOperation } from "./property-arbitraries/index.js";

export { arbByKind, arbChangeSet, arbOperation } from "./property-arbitraries/index.js";

describe("property arbitraries compatibility barrel", () => {
  it.each(OPERATION_KINDS)("generates schema-valid %s operations", (kind) => {
    fc.assert(
      fc.property(arbByKind[kind], (operation) => OperationSchema.safeParse(operation).success),
      { numRuns: 20 },
    );
  });

  it("generates schema-valid operations through the aggregate arbitrary", () => {
    fc.assert(
      fc.property(arbOperation, (operation) => OperationSchema.safeParse(operation).success),
      { numRuns: 200 },
    );
  });

  it("generates canonical schema-valid changesets", () => {
    fc.assert(
      fc.property(arbChangeSet, (changeSet) => {
        const result = ChangeSetSchema.safeParse(changeSet);
        expect(result.success).toBe(true);
        return result.success && result.data.schemaVersion === "2.1.0";
      }),
      { numRuns: 20 },
    );
  });
});
