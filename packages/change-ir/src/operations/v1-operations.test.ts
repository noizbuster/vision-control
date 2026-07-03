import { describe, expect, it } from "vitest";

import {
  appendOperation,
  type ChangeSet,
  computeInverse,
  createChangeSet,
  deserializeChangeSet,
  type Operation,
  OperationSchema,
  serializeChangeSet,
} from "../index.js";

const BASE_TIME = 1_700_000_000_000;

const el = (runtimeId: string) => ({ runtimeId });

const v2Defaults = {
  schemaVersion: "2.0.0" as const,
  workspaceId: "ws-v1-test-001",
  page: { url: "https://localhost/page", title: null },
  viewport: { width: 1280, height: 720 },
  selectedTargets: [],
  sourceResolutions: [],
  verificationPlan: { assertions: [], notes: "test plan" },
  privacyReport: { redactions: [], totalRedacted: 0 },
};

const base = (id: string, ts: number, runtime = false) => ({
  id,
  timestamp: ts,
  runtime,
  origin: "property-panel" as const,
  confidence: 1,
});

const multiSelectGroupOp: Operation = {
  ...base("op-msel-grp001", BASE_TIME),
  kind: "multi-select-group",
  targets: [el("card-a"), el("card-b"), el("card-c")],
  groupId: "grp-001",
  previousTargets: [el("card-a")],
};

const groupReorderOp: Operation = {
  ...base("op-grodr-00001", BASE_TIME + 1),
  kind: "group-reorder",
  parent: el("row-1"),
  children: [el("card-c"), el("card-a"), el("card-b")],
  previousOrder: [0, 1, 2],
  newOrder: [2, 0, 1],
};

const groupReparentOp: Operation = {
  ...base("op-grepr-00001", BASE_TIME + 2),
  kind: "group-reparent",
  elements: [el("card-a"), el("card-b")],
  sourceParent: el("row-1"),
  sourceIndices: [0, 1],
  targetParent: el("row-2"),
  targetIndices: [0, 1],
};

const alignElementsOp: Operation = {
  ...base("op-align-00001", BASE_TIME + 3),
  kind: "align-elements",
  targets: [el("card-a"), el("card-b"), el("card-c")],
  alignment: "center",
  previousValues: ["0px", "4px", "8px"],
  newValues: ["4px", "4px", "4px"],
};

const distributeElementsOp: Operation = {
  ...base("op-distr-00001", BASE_TIME + 4),
  kind: "distribute-elements",
  targets: [el("card-a"), el("card-b"), el("card-c")],
  axis: "horizontal",
  mode: "space-between",
  previousGaps: ["2px", "2px"],
  newGaps: ["8px", "8px"],
};

const setContainerLayoutOp: Operation = {
  ...base("op-ctrlay0001", BASE_TIME + 5),
  kind: "set-container-layout",
  container: el("row-1"),
  property: "flex-direction",
  value: "column",
  previousValue: "row",
};

const setChildSizingOp: Operation = {
  ...base("op-chldsz0001", BASE_TIME + 6),
  kind: "set-child-sizing",
  container: el("row-1"),
  childIndex: 0,
  child: el("card-a"),
  sizing: "fill",
  previousSizing: "hug",
  value: "flex:1",
  previousValue: "width:auto",
};

const gridReorderOp: Operation = {
  ...base("op-gridrd0001", BASE_TIME + 7),
  kind: "grid-reorder",
  grid: el("grid-1"),
  child: el("cell-3"),
  placement: "grid-area",
  fromIndex: 2,
  toIndex: 0,
  previousGridArea: "1 / 3",
  newGridArea: "1 / 1",
};

const gridSpanOp: Operation = {
  ...base("op-gridsp0001", BASE_TIME + 8),
  kind: "grid-span",
  grid: el("grid-1"),
  child: el("cell-1"),
  axis: "column",
  fromSpan: 1,
  toSpan: 2,
};

const breakpointStyleEditOp: Operation = {
  ...base("op-bp-sty0001", BASE_TIME + 9),
  kind: "breakpoint-style-edit",
  target: el("card-a"),
  breakpoint: "md",
  mediaSource: "@media (min-width: 768px)",
  property: "padding",
  value: "16px",
  important: false,
  previousValue: "8px",
};

const breakpointClassEditOp: Operation = {
  ...base("op-bp-cls0001", BASE_TIME + 10),
  kind: "breakpoint-class-edit",
  target: el("card-a"),
  breakpoint: "md",
  oldClassName: "p-2",
  newClassName: "p-4",
};

const breakpointTextEditOp: Operation = {
  ...base("op-bp-txt0001", BASE_TIME + 11),
  kind: "breakpoint-text-edit",
  target: el("card-a"),
  breakpoint: "md",
  newText: "Expanded",
  previousText: "Short",
};

const screenshotCropRefOp: Operation = {
  ...base("op-shot-000001", BASE_TIME + 12),
  kind: "screenshot-crop-ref",
  target: el("card-a"),
  artifactId: "shot-art-0001",
  captureRegion: { x: 0, y: 0, width: 200, height: 80 },
  redactionReport: "redact-report-0001",
  retentionExpiresAt: BASE_TIME + 60_000,
};

const suggestedDiffOp: Operation = {
  ...base("op-sdiff-00001", BASE_TIME + 13),
  kind: "suggested-diff",
  target: el("card-a"),
  diff: "@@ -1,1 +1,1 @@\n-p-2\n+p-4",
  sourceRanges: [{ startLine: 1, startColumn: 0, endLine: 1, endColumn: 3 }],
  confidence: "high",
  preconditions: ["static class string"],
  applied: false,
};

const v1Ops: ReadonlyArray<readonly [string, Operation]> = [
  ["multi-select-group", multiSelectGroupOp],
  ["group-reorder", groupReorderOp],
  ["group-reparent", groupReparentOp],
  ["align-elements", alignElementsOp],
  ["distribute-elements", distributeElementsOp],
  ["set-container-layout", setContainerLayoutOp],
  ["set-child-sizing", setChildSizingOp],
  ["grid-reorder", gridReorderOp],
  ["grid-span", gridSpanOp],
  ["breakpoint-style-edit", breakpointStyleEditOp],
  ["breakpoint-class-edit", breakpointClassEditOp],
  ["breakpoint-text-edit", breakpointTextEditOp],
  ["screenshot-crop-ref", screenshotCropRefOp],
  ["suggested-diff", suggestedDiffOp],
];

describe("V1 operation schema validation", () => {
  it.each(v1Ops)("accepts a valid %s operation", (_kind, op) => {
    expect(OperationSchema.safeParse(op).success).toBe(true);
  });

  it("rejects a group-reorder with fewer than 2 children", () => {
    const bad = { ...groupReorderOp, children: [el("card-a")] } as unknown as Operation;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a grid-span with a non-positive span", () => {
    const bad = { ...gridSpanOp, toSpan: 0 } as unknown as Operation;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a screenshot-crop-ref missing the artifact id", () => {
    const { artifactId: _omit, ...bad } = screenshotCropRefOp;
    void _omit;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a suggested-diff missing the diff text", () => {
    const { diff: _omit, ...bad } = suggestedDiffOp;
    void _omit;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid alignment enum value", () => {
    const bad = { ...alignElementsOp, alignment: "diagonal" } as unknown as Operation;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });
});

describe("V1 computeInverse — every new kind has a computable inverse", () => {
  it.each(v1Ops)("produces a schema-valid inverse for %s", (_kind, op) => {
    const inverse = computeInverse(op);
    expect(inverse.id).not.toBe(op.id);
    expect(inverse.inverseOf).toBe(op.id);
    expect(inverse.runtime).toBe(op.runtime);
    expect(OperationSchema.safeParse(inverse).success).toBe(true);
  });

  it("multi-select-group inverse swaps targets", () => {
    const inv = computeInverse(multiSelectGroupOp);
    if (inv.kind !== "multi-select-group") throw new Error("expected multi-select-group");
    expect(inv.targets).toEqual([el("card-a")]);
    expect(inv.previousTargets).toEqual([el("card-a"), el("card-b"), el("card-c")]);
  });

  it("group-reorder inverse swaps orderings", () => {
    const inv = computeInverse(groupReorderOp);
    if (inv.kind !== "group-reorder") throw new Error("expected group-reorder");
    expect(inv.previousOrder).toEqual([2, 0, 1]);
    expect(inv.newOrder).toEqual([0, 1, 2]);
  });

  it("group-reparent inverse swaps source/target parents", () => {
    const inv = computeInverse(groupReparentOp);
    if (inv.kind !== "group-reparent") throw new Error("expected group-reparent");
    expect(inv.sourceParent.runtimeId).toBe("row-2");
    expect(inv.targetParent.runtimeId).toBe("row-1");
  });

  it("set-container-layout inverse swaps values", () => {
    const inv = computeInverse(setContainerLayoutOp);
    if (inv.kind !== "set-container-layout") throw new Error("expected set-container-layout");
    expect(inv.value).toBe("row");
    expect(inv.previousValue).toBe("column");
  });

  it("grid-reorder inverse swaps indices and grid areas", () => {
    const inv = computeInverse(gridReorderOp);
    if (inv.kind !== "grid-reorder") throw new Error("expected grid-reorder");
    expect(inv.fromIndex).toBe(0);
    expect(inv.toIndex).toBe(2);
    expect(inv.previousGridArea).toBe("1 / 1");
    expect(inv.newGridArea).toBe("1 / 3");
    expect(inv.placement).toBe("grid-area");
  });

  it("grid-span inverse swaps spans", () => {
    const inv = computeInverse(gridSpanOp);
    if (inv.kind !== "grid-span") throw new Error("expected grid-span");
    expect(inv.fromSpan).toBe(2);
    expect(inv.toSpan).toBe(1);
  });

  it("breakpoint-style-edit inverse carries the breakpoint forward", () => {
    const inv = computeInverse(breakpointStyleEditOp);
    if (inv.kind !== "breakpoint-style-edit") throw new Error("expected breakpoint-style-edit");
    expect(inv.breakpoint).toBe("md");
    expect(inv.value).toBe("8px");
    expect(inv.previousValue).toBe("16px");
    expect(inv.mediaSource).toBe("@media (min-width: 768px)");
  });

  it("breakpoint-class-edit inverse swaps classes", () => {
    const inv = computeInverse(breakpointClassEditOp);
    if (inv.kind !== "breakpoint-class-edit") throw new Error("expected breakpoint-class-edit");
    expect(inv.oldClassName).toBe("p-4");
    expect(inv.newClassName).toBe("p-2");
  });

  it("screenshot-crop-ref inverse is a no-op marker preserving the artifact", () => {
    const inv = computeInverse(screenshotCropRefOp);
    if (inv.kind !== "screenshot-crop-ref") throw new Error("expected screenshot-crop-ref");
    expect(inv.artifactId).toBe("shot-art-0001");
    expect(inv.captureRegion).toEqual({ x: 0, y: 0, width: 200, height: 80 });
  });

  it("suggested-diff inverse is an inert no-op marker", () => {
    const inv = computeInverse(suggestedDiffOp);
    if (inv.kind !== "suggested-diff") throw new Error("expected suggested-diff");
    expect(inv.applied).toBe(false);
    expect(inv.diff).toBe(suggestedDiffOp.diff);
  });
});

describe("V1 serialization round-trip", () => {
  const fixedChangeSet = (): ChangeSet => ({
    ...v2Defaults,
    id: "cs-v1roundtrip01",
    sessionId: "sess-v1roundtrp",
    operations: [
      multiSelectGroupOp,
      gridSpanOp,
      breakpointStyleEditOp,
      screenshotCropRefOp,
      suggestedDiffOp,
    ],
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME + 1,
    committed: false,
  });

  it("serialize -> deserialize round-trips a mixed V1 changeset byte-identical", () => {
    const cs = fixedChangeSet();
    const serialized = serializeChangeSet(cs);
    const result = deserializeChangeSet(serialized);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(cs);
      expect(serializeChangeSet(result.data)).toBe(serialized);
    }
  });

  it("a changeset containing every V1 kind round-trips through the schema", () => {
    let cs = createChangeSet({
      workspaceId: "ws-all-v1",
      sessionId: "sess-all-v1",
      id: "cs-allv1kind0001",
      now: BASE_TIME,
    });
    for (const [, op] of v1Ops) cs = appendOperation(cs, op);
    const result = deserializeChangeSet(serializeChangeSet(cs));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.operations).toHaveLength(v1Ops.length);
  });

  it("rejects a stale V1 changeset missing a required field", () => {
    const cs = fixedChangeSet();
    const serialized = serializeChangeSet(cs);
    const mutated = JSON.parse(serialized) as { operations: unknown[] };
    const first = mutated.operations[0] as Record<string, unknown>;
    delete first.targets;
    const result = deserializeChangeSet(JSON.stringify(mutated));
    expect(result.success).toBe(false);
  });

  it("deserialize never throws on malformed V1 input", () => {
    expect(deserializeChangeSet("{broken").success).toBe(false);
    expect(deserializeChangeSet(JSON.stringify({ id: "x" })).success).toBe(false);
  });
});
