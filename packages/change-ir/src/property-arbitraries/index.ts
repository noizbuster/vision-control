import * as fc from "fast-check";

import type { ChangeSet } from "../changeset.js";
import { ChangeSetSchema } from "../changeset.js";
import type { Operation, OperationKind } from "../operations/index.js";
import { arbBool, arbElementRef, arbIdent, arbNat, arbSafeId, arbTimestamp } from "./base.js";
import { layoutArbitraries } from "./layout.js";
import { metadataArbitraries } from "./metadata.js";
import { structuralArbitraries } from "./structural.js";
import { styleArbitraries } from "./style.js";

export const arbByKind = {
  ...styleArbitraries,
  ...structuralArbitraries,
  ...layoutArbitraries,
  ...metadataArbitraries,
} satisfies Record<OperationKind, fc.Arbitrary<Operation>>;

export const arbOperation: fc.Arbitrary<Operation> = fc.oneof(...Object.values(arbByKind));

export const arbChangeSet: fc.Arbitrary<ChangeSet> = fc
  .record({
    schemaVersion: fc.constant("2.1.0"),
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
  .map((raw) => ChangeSetSchema.parse(raw));
