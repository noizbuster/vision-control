import { VisionContextSnapshotSchema } from "@vision-control/context-compiler";
import { describe, expect, it } from "vitest";

import { createCommandQueue, createProjectionCache, createProjectionDeps } from "./index.js";

const pairSummary = {
  id: "op-flex-pair-001",
  kind: "resize-flex-pair",
  runtime: false,
  description: "Resize a flex pair",
  target: ".card[0]",
  detail: {
    target: {
      runtimeId: "primary-runtime",
      sourceId: "source-primary-runtime",
      selector: ".card",
      occurrence: 0,
      fingerprint: "fingerprint-0",
    },
    container: {
      runtimeId: "container-runtime",
      selector: ".row",
      occurrence: 0,
      fingerprint: "container-fingerprint",
    },
    members: [
      {
        role: "primary",
        element: {
          runtimeId: "primary-runtime",
          selector: ".card",
          occurrence: 0,
          fingerprint: "fingerprint-0",
        },
        before: {
          flex: { flexGrow: "1", flexShrink: "1", flexBasis: "auto" },
          usedMainSize: 200,
        },
        after: {
          flex: { flexGrow: "0", flexShrink: "0", flexBasis: "240px" },
          usedMainSize: 240,
        },
      },
      {
        role: "neighbor",
        element: {
          runtimeId: "neighbor-runtime",
          selector: ".card",
          occurrence: 1,
          fingerprint: "fingerprint-1",
        },
        before: {
          flex: { flexGrow: "2", flexShrink: "1", flexBasis: "180px" },
          usedMainSize: 180,
        },
        after: {
          flex: { flexGrow: "0", flexShrink: "0", flexBasis: "140px" },
          usedMainSize: 140,
        },
      },
    ],
    containerWitness: {
      before: { x: 0, y: 0, width: 600, height: 100 },
      after: { x: 0, y: 0, width: 600, height: 100 },
    },
    witnesses: [
      {
        element: {
          runtimeId: "witness-runtime",
          selector: ".card",
          occurrence: 2,
          fingerprint: "fingerprint-2",
        },
        before: { x: 400, y: 0, width: 200, height: 100 },
        after: { x: 400, y: 0, width: 200, height: 100 },
      },
    ],
    witnessCount: 1,
    axis: {
      writingMode: "horizontal-tb",
      direction: "ltr",
      flexDirection: "row",
      logicalAxis: "inline",
      physicalAxis: "x",
      directionSign: 1,
      handleBoundary: "main-end",
    },
    delta: 40,
  },
};

describe("MCP resize-flex-pair projection", () => {
  it("preserves one structured pair operation through source context and changeset reads", async () => {
    const snapshot = VisionContextSnapshotSchema.parse({
      formatVersion: "1.1.0",
      snapshotRev: 1,
      tabId: "tab-flex",
      sessionId: "session-flex",
      compiledAt: 1_700_000_000_000,
      operations: [pairSummary],
      journal: {
        entryCount: 1,
        canUndo: true,
        canRedo: false,
        undoDepth: 1,
        redoDepth: 0,
        recentKinds: ["resize-flex-pair"],
      },
      origins: [],
      originsTruncated: false,
      privacyReport: { redactions: [], totalRedacted: 0 },
      warnings: [],
    });
    const cache = createProjectionCache();
    cache.markPaired(1_000);
    cache.ingest({
      tabId: "tab-flex",
      sessionId: "session-flex",
      snapshotRev: 1,
      snapshot,
      ingestedAt: 1_000,
    });
    const deps = createProjectionDeps({
      cache,
      commands: createCommandQueue(),
      now: () => 1_000,
    });

    const context = await deps.getSourceContext();
    expect(context).toMatchObject({ operations: [pairSummary] });
    const changeset = await deps.getChangeset();
    expect(changeset.operationCount).toBe(1);
    expect(changeset.operations).toEqual([
      {
        id: pairSummary.id,
        kind: pairSummary.kind,
        runtime: pairSummary.runtime,
        description: pairSummary.description,
      },
    ]);
  });

  it("still fresh-fails after the pair disconnects", async () => {
    const cache = createProjectionCache();
    cache.markPaired(1_000);
    cache.markUnpaired();
    const deps = createProjectionDeps({
      cache,
      commands: createCommandQueue(),
      now: () => 1_000,
    });

    expect(await deps.getSourceContext()).toBeUndefined();
    expect((await deps.getActiveSession()).note).toBe("not_paired");
    expect((await deps.getVerificationPlan()).passed).not.toBe(true);
  });

  it("rejects malformed pair detail before cache ingestion", () => {
    const malformed = {
      ...pairSummary,
      detail: { ...pairSummary.detail, witnessCount: 0 },
    };
    const result = VisionContextSnapshotSchema.safeParse({
      formatVersion: "1.1.0",
      snapshotRev: 1,
      compiledAt: 1,
      operations: [malformed],
      journal: {
        entryCount: 1,
        canUndo: true,
        canRedo: false,
        undoDepth: 1,
        redoDepth: 0,
        recentKinds: ["resize-flex-pair"],
      },
      origins: [],
      originsTruncated: false,
      privacyReport: { redactions: [], totalRedacted: 0 },
      warnings: [],
    });

    expect(result.success).toBe(false);
  });
});
