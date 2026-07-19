import { CHANGE_IR_SCHEMA_VERSION, OPERATION_KINDS } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

import {
  CONTEXT_FORMAT_VERSION,
  OPERATION_SUMMARY_KINDS,
  OperationSummarySchema,
} from "./context-schema.js";
import { makeFlexResizeOperation } from "./flex-resize.test-fixture.js";
import { summarizeOperation } from "./operation-summary.js";
import { SNAPSHOT_FORMAT_VERSION, VisionContextSnapshotSchema } from "./snapshot-schema.js";

describe("resize-flex-pair operation summary", () => {
  it("projects both members, flex states, sizes, witnesses, and axis metadata", () => {
    const summary = summarizeOperation(makeFlexResizeOperation());
    const parsed = OperationSummarySchema.parse(summary);

    expect(parsed.kind).toBe("resize-flex-pair");
    if (parsed.kind !== "resize-flex-pair") return;
    expect(parsed.detail.members).toHaveLength(2);
    expect(parsed.detail.members[0].element).toMatchObject({
      selector: ".card",
      occurrence: 0,
      fingerprint: "fingerprint-0",
    });
    expect(parsed.detail.members[0].before.flex).toEqual({
      flexGrow: "1",
      flexShrink: "1",
      flexBasis: "auto",
    });
    expect(parsed.detail.members[0].after.usedMainSize).toBe(240);
    expect(parsed.detail.members[1].after.flex.flexBasis).toBe("140px");
    expect(parsed.detail.witnesses).toHaveLength(1);
    expect(parsed.detail.witnessCount).toBe(1);
    expect(parsed.detail.axis).toMatchObject({
      logicalAxis: "inline",
      physicalAxis: "x",
      directionSign: 1,
    });
  });

  it("uses the canonical additive context and snapshot versions", () => {
    expect(CONTEXT_FORMAT_VERSION).toBe("1.2.0");
    expect(SNAPSHOT_FORMAT_VERSION).toBe("1.1.0");
    expect(CHANGE_IR_SCHEMA_VERSION).toBe("2.1.0");
    expect(OPERATION_SUMMARY_KINDS).toEqual(OPERATION_KINDS);
  });

  it("rejects malformed aggregate summary detail", () => {
    const summary = summarizeOperation(makeFlexResizeOperation());
    expect(summary.kind).toBe("resize-flex-pair");
    if (summary.kind !== "resize-flex-pair") return;
    const malformed = {
      ...summary,
      detail: {
        ...summary.detail,
        members: [summary.detail.members[0], summary.detail.members[0]],
        witnessCount: 0,
      },
    };

    expect(OperationSummarySchema.safeParse(malformed).success).toBe(false);
  });

  it("continues to parse a legacy 1.0.0 snapshot", () => {
    const result = VisionContextSnapshotSchema.safeParse({
      formatVersion: "1.0.0",
      snapshotRev: 0,
      compiledAt: 1,
      operations: [],
      journal: {
        entryCount: 0,
        canUndo: false,
        canRedo: false,
        undoDepth: 0,
        redoDepth: 0,
        recentKinds: [],
      },
      origins: [],
      originsTruncated: false,
      privacyReport: { redactions: [], totalRedacted: 0 },
      warnings: [],
    });

    expect(result.success).toBe(true);
  });
});
