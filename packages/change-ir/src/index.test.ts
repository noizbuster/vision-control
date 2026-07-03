import { describe, expect, it } from "vitest";

import {
  appendOperation,
  type ChangeSet,
  ChangeSetSchema,
  computeInverse,
  createChangeSet,
  deserializeChangeSet,
  mergeChangeSets,
  migrateChangeset_1_to_2,
  type Operation,
  OperationSchema,
  removeOperation,
  serializeChangeSet,
  supersedeChangeSet,
} from "./index.js";
import type { ReorderChildOperation, StyleEditOperation } from "./operations/index.js";

const BASE_TIME = 1_700_000_000_000;

const el = (runtimeId: string) => ({ runtimeId });

const v2Defaults = {
  schemaVersion: "2.0.0" as const,
  workspaceId: "ws-test-0001",
  page: { url: "https://localhost/page", title: null },
  viewport: { width: 1280, height: 720 },
  selectedTargets: [],
  sourceResolutions: [],
  verificationPlan: { assertions: [], notes: "test plan" },
  privacyReport: { redactions: [], totalRedacted: 0 },
};

/** A forward style edit (runtime:false = source intent) with a captured prior value. */
const styleEdit = (): Operation => ({
  id: "op-style-00001",
  timestamp: BASE_TIME,
  runtime: false,
  kind: "style-edit",
  target: el("btn-primary"),
  property: "color",
  value: "blue",
  important: false,
  previousValue: "red",
});

const classAddOp: Operation = {
  id: "op-classadd001",
  timestamp: BASE_TIME + 1,
  runtime: false,
  kind: "class-add",
  target: el("btn-primary"),
  className: "is-active",
};
const classRemoveOp: Operation = {
  id: "op-classrm001",
  timestamp: BASE_TIME + 2,
  runtime: false,
  kind: "class-remove",
  target: el("btn-primary"),
  className: "is-hidden",
};
const classReplaceOp: Operation = {
  id: "op-classrep001",
  timestamp: BASE_TIME + 3,
  runtime: false,
  kind: "class-replace",
  target: el("btn-primary"),
  oldClassName: "size-md",
  newClassName: "size-lg",
};
const textEditOp: Operation = {
  id: "op-textedit001",
  timestamp: BASE_TIME + 4,
  runtime: false,
  kind: "text-edit",
  target: el("label-name"),
  newText: "Hello",
  previousText: "Hi",
};
const reorderOp: Operation = {
  id: "op-reorder0001",
  timestamp: BASE_TIME + 5,
  runtime: false,
  kind: "reorder-child",
  parent: el("row-1"),
  child: el("card-c"),
  fromIndex: 2,
  toIndex: 0,
};
const reparentOp: Operation = {
  id: "op-reparent001",
  timestamp: BASE_TIME + 6,
  runtime: false,
  kind: "reparent-element",
  element: el("card-c"),
  sourceParent: el("row-1"),
  sourceIndex: 1,
  targetParent: el("row-2"),
  targetIndex: 0,
};
const resizeOp: Operation = {
  id: "op-resize00001",
  timestamp: BASE_TIME + 7,
  runtime: false,
  kind: "resize-element",
  element: el("card-c"),
  property: "width",
  fromValue: "200",
  toValue: "320",
  unit: "px",
};

const sampleOps: Operation[] = [
  styleEdit(),
  classAddOp,
  classRemoveOp,
  classReplaceOp,
  textEditOp,
  reorderOp,
  reparentOp,
  resizeOp,
];

describe("operation schema validation", () => {
  it.each(
    sampleOps.map((op) => [op.kind, op] as const),
  )("accepts a valid %s operation", (_kind, op) => {
    expect(OperationSchema.safeParse(op).success).toBe(true);
  });

  it("rejects a negative reorder index", () => {
    const bad = { ...reorderOp, fromIndex: -1 } as unknown as Operation;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown operation kind", () => {
    const bad = { ...styleEdit(), kind: "unknown-kind" };
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a malformed operation id", () => {
    const bad = { ...styleEdit(), id: "x" };
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an operation missing the runtime flag", () => {
    const { runtime: _omit, ...bad } = styleEdit();
    void _omit;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid resize property", () => {
    const bad = { ...resizeOp, property: "font-size" } as unknown as Operation;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });
});

describe("computeInverse — every kind has a computable inverse", () => {
  it.each(
    sampleOps.map((op) => [op.kind, op] as const),
  )("produces a schema-valid inverse for %s", (_kind, op) => {
    const inverse = computeInverse(op);
    expect(inverse.id).not.toBe(op.id);
    expect(inverse.inverseOf).toBe(op.id);
    expect(inverse.runtime).toBe(op.runtime);
    expect(OperationSchema.safeParse(inverse).success).toBe(true);
  });

  it("preserves the runtime flag (preview inverse stays a preview)", () => {
    const previewOp: Operation = { ...styleEdit(), id: "op-preview001", runtime: true };
    const inverse = computeInverse(previewOp);
    expect(inverse.runtime).toBe(true);
  });
});

describe("style edit inverse round-trips the value", () => {
  type StyleState = Record<string, string>;
  const applyStyleEdit = (state: StyleState, op: StyleEditOperation): StyleState => ({
    ...state,
    [op.property]: op.value,
  });

  it("apply then inverse restores the original value", () => {
    const initial: StyleState = { color: "red" };
    const op = styleEdit();
    if (op.kind !== "style-edit") throw new Error("expected style-edit");
    const after = applyStyleEdit(initial, op);
    expect(after.color).toBe("blue");
    const inverse = computeInverse(op);
    if (inverse.kind !== "style-edit") throw new Error("expected style-edit inverse");
    const restored = applyStyleEdit(after, inverse);
    expect(restored).toEqual(initial);
  });
});

describe("reorder inverse restores the original array", () => {
  const applyReorder = (children: readonly string[], op: ReorderChildOperation): string[] => {
    const next = [...children];
    const [moved] = next.splice(op.fromIndex, 1);
    if (moved === undefined) throw new Error(`bad fromIndex ${op.fromIndex}`);
    next.splice(op.toIndex, 0, moved);
    return next;
  };

  it("move 2->0 then its inverse 0->2 restores order", () => {
    const original = ["a", "b", "c", "d"];
    const op: ReorderChildOperation = {
      id: "op-reorder-t01",
      timestamp: BASE_TIME,
      runtime: false,
      kind: "reorder-child",
      parent: el("row"),
      child: el("card-c"),
      fromIndex: 2,
      toIndex: 0,
    };
    const moved = applyReorder(original, op);
    expect(moved).toEqual(["c", "a", "b", "d"]);
    const inverse = computeInverse(op);
    if (inverse.kind !== "reorder-child") throw new Error("expected reorder-child inverse");
    expect(inverse.fromIndex).toBe(0);
    expect(inverse.toIndex).toBe(2);
    const restored = applyReorder(moved, inverse);
    expect(restored).toEqual(original);
  });

  it("permutation consistency: N reorders then N inverses (reverse) = original", () => {
    const original = ["a", "b", "c", "d", "e"];
    const reorderAt = (fromIndex: number, toIndex: number): ReorderChildOperation => ({
      id: `op-reorder-${fromIndex}-${toIndex}`,
      timestamp: BASE_TIME,
      runtime: false,
      kind: "reorder-child",
      parent: el("row"),
      child: el(`el-${fromIndex}`),
      fromIndex,
      toIndex,
    });
    const ops = [reorderAt(2, 0), reorderAt(4, 1), reorderAt(0, 3)];
    let state = [...original];
    for (const op of ops) state = applyReorder(state, op);
    // Apply inverses in reverse order.
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i];
      if (op === undefined) continue;
      const inv = computeInverse(op);
      if (inv.kind !== "reorder-child") throw new Error("expected reorder-child inverse");
      state = applyReorder(state, inv);
    }
    expect(state).toEqual(original);
  });
});

describe("class operation inverses", () => {
  it("class-add inverts to class-remove and back", () => {
    const inv = computeInverse(classAddOp);
    expect(inv.kind).toBe("class-remove");
    if (inv.kind === "class-remove") expect(inv.className).toBe("is-active");
    expect(computeInverse(inv).kind).toBe("class-add");
  });

  it("class-replace swaps old/new", () => {
    const inv = computeInverse(classReplaceOp);
    if (inv.kind !== "class-replace") throw new Error("expected class-replace");
    expect(inv.oldClassName).toBe("size-lg");
    expect(inv.newClassName).toBe("size-md");
  });
});

describe("resize and reparent inverses", () => {
  it("resize swaps from/to values", () => {
    const inv = computeInverse(resizeOp);
    if (inv.kind !== "resize-element") throw new Error("expected resize-element");
    expect(inv.fromValue).toBe("320");
    expect(inv.toValue).toBe("200");
  });

  it("reparent swaps source/target parent and index", () => {
    const inv = computeInverse(reparentOp);
    if (inv.kind !== "reparent-element") throw new Error("expected reparent-element");
    expect(inv.sourceParent.runtimeId).toBe("row-2");
    expect(inv.sourceIndex).toBe(0);
    expect(inv.targetParent.runtimeId).toBe("row-1");
    expect(inv.targetIndex).toBe(1);
  });
});

describe("changeset operations", () => {
  it("createChangeSet yields an empty uncommitted set", () => {
    const cs = createChangeSet({
      workspaceId: "ws-create001",
      sessionId: "sess-create001",
      now: BASE_TIME,
    });
    expect(cs.operations).toEqual([]);
    expect(cs.committed).toBe(false);
    expect(cs.sessionId).toBe("sess-create001");
    expect("supersededBy" in cs).toBe(false);
  });

  it("appendOperation and removeOperation update the operations list", () => {
    let cs = createChangeSet({
      workspaceId: "ws-append001",
      sessionId: "sess-append0001",
      now: BASE_TIME,
    });
    cs = appendOperation(cs, styleEdit());
    expect(cs.operations).toHaveLength(1);
    cs = removeOperation(cs, "op-style-00001");
    expect(cs.operations).toHaveLength(0);
    expect(cs.updatedAt).toBeGreaterThanOrEqual(cs.createdAt);
  });
});

describe("serialization", () => {
  const fixedChangeSet = (): ChangeSet => ({
    ...v2Defaults,
    id: "cs-fixed-000001",
    sessionId: "sess-fixed-001",
    operations: [styleEdit()],
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME + 1,
    committed: false,
  });

  it("serialize -> deserialize round-trips equal", () => {
    const cs = fixedChangeSet();
    const result = deserializeChangeSet(serializeChangeSet(cs));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(cs);
  });

  it("is deterministic for the same input", () => {
    const cs = fixedChangeSet();
    expect(serializeChangeSet(cs)).toBe(serializeChangeSet(cs));
  });

  it("preserves the runtime flag through round-trip", () => {
    const cs: ChangeSet = {
      ...fixedChangeSet(),
      operations: [{ ...styleEdit(), runtime: true }],
    };
    const result = deserializeChangeSet(serializeChangeSet(cs));
    expect(result.success).toBe(true);
    if (result.success) {
      const op = result.data.operations[0];
      if (op && op.kind === "style-edit") expect(op.runtime).toBe(true);
    }
  });

  it("returns an error result (never throws) on invalid JSON", () => {
    const result = deserializeChangeSet("{not json");
    expect(result.success).toBe(false);
  });

  it("returns an error result on a structurally invalid changeset", () => {
    const result = deserializeChangeSet(JSON.stringify({ id: "x" }));
    expect(result.success).toBe(false);
  });
});

describe("merge and supersede", () => {
  const baseCs = (operations: readonly Operation[]): ChangeSet => ({
    ...v2Defaults,
    id: `cs-${operations[0]?.id ?? "empty"}`,
    sessionId: "sess-merge-0001",
    operations: [...operations],
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    committed: false,
  });

  it("merges non-conflicting changesets", () => {
    const a = baseCs([styleEdit()]);
    const b = baseCs([
      {
        id: "op-merge-text01",
        timestamp: BASE_TIME,
        runtime: false,
        kind: "text-edit",
        target: el("label-other"),
        newText: "New",
      },
    ]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet.operations).toHaveLength(2);
  });

  it("rejects conflicting same-target-property edits without inverse", () => {
    const a = baseCs([styleEdit()]);
    const b = baseCs([
      {
        id: "op-conflict001",
        timestamp: BASE_TIME,
        runtime: false,
        kind: "style-edit",
        target: el("btn-primary"),
        property: "color",
        value: "green",
        important: false,
      },
    ]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts).toHaveLength(1);
  });

  it("allows an inverse pair through the merge", () => {
    const a = baseCs([styleEdit()]);
    const inverse = computeInverse(styleEdit());
    const b = baseCs([inverse]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(true);
  });

  it("supersedeChangeSet marks old as superseded by next", () => {
    const old = baseCs([styleEdit()]);
    const next = createChangeSet({ workspaceId: "ws-next-0001", sessionId: "sess-next-0001" });
    const { old: updatedOld, next: returnedNext } = supersedeChangeSet(old, next);
    expect(updatedOld.supersededBy).toBe(next.id);
    expect(returnedNext.id).toBe(next.id);
  });
});

describe("PRD §12.2 schema v2.0.0", () => {
  it("createChangeSet stamps schemaVersion 2.0.0 and all PRD §12.2 required fields", () => {
    const cs = createChangeSet({ workspaceId: "ws-001", sessionId: "sess-001" });
    expect(cs.schemaVersion).toBe("2.0.0");
    expect(ChangeSetSchema.safeParse(cs).success).toBe(true);
    expect(cs.page).toEqual({ url: "<unknown>", title: null });
    expect(cs.viewport).toEqual({ width: 0, height: 0 });
    expect(cs.selectedTargets).toEqual([]);
    expect(cs.sourceResolutions).toEqual([]);
    expect(cs.verificationPlan.assertions).toEqual([]);
    expect(cs.privacyReport.totalRedacted).toBe(0);
    expect(cs.committed).toBe(false);
  });

  it("a v2 changeset round-trips through serialize -> parse deep-equal", () => {
    const cs: ChangeSet = {
      ...v2Defaults,
      id: "cs-v2roundtrip01",
      sessionId: "sess-v2roundtrp",
      operations: [styleEdit(), reorderOp],
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME + 2,
      committed: true,
      title: "Round-trip suite",
      userInstruction: "make it blue",
    };
    const result = deserializeChangeSet(serializeChangeSet(cs));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(cs);
  });

  it("createChangeSet honors explicit page/viewport/title overrides", () => {
    const cs = createChangeSet({
      workspaceId: "ws-override",
      sessionId: "sess-override",
      page: { url: "https://localhost/app", title: "App" },
      viewport: { width: 1920, height: 1080 },
      title: "Custom",
      userInstruction: "fix header",
    });
    expect(cs.page).toEqual({ url: "https://localhost/app", title: "App" });
    expect(cs.viewport).toEqual({ width: 1920, height: 1080 });
    expect(cs.title).toBe("Custom");
    expect(cs.userInstruction).toBe("fix header");
    expect(ChangeSetSchema.safeParse(cs).success).toBe(true);
  });
});

describe("migrateChangeset_1_to_2", () => {
  const v1Document = {
    id: "cs-v1-0001",
    sessionId: "sess-v1-0001",
    operations: [styleEdit()],
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME + 1,
    committed: true,
  };

  it("produces a v2 ChangeSet that passes the v2 schema with the R8 binding defaults", () => {
    const migrated = migrateChangeset_1_to_2(v1Document);
    expect(ChangeSetSchema.safeParse(migrated).success).toBe(true);
    expect(migrated.schemaVersion).toBe("2.0.0");
    expect(migrated.workspaceId).toBe("<unknown>");
    expect(migrated.page).toEqual({ url: "<unknown>", title: null });
    expect(migrated.viewport).toEqual({ width: 0, height: 0 });
    expect(migrated.selectedTargets).toEqual([]);
    expect(migrated.sourceResolutions).toEqual([]);
    expect(migrated.verificationPlan).toEqual({
      assertions: [],
      notes: "migrated from v1 — recompile via verification engine",
    });
    expect(migrated.privacyReport).toEqual({
      redactions: [],
      totalRedacted: 0,
      note: "migrated v1 — recompute via redaction engine",
    });
    expect(migrated.committed).toBe(true);
    expect(migrated.operations).toHaveLength(1);
  });

  it("preserves v1 supersededBy and operations through the migration", () => {
    const v1WithSupersede = {
      ...v1Document,
      supersededBy: "cs-v1-newer01",
      operations: [styleEdit(), classAddOp],
    };
    const migrated = migrateChangeset_1_to_2(v1WithSupersede);
    expect(migrated.supersededBy).toBe("cs-v1-newer01");
    expect(migrated.operations).toHaveLength(2);
  });

  it("a v1 document fed to the v2 parser WITHOUT the migrator fails clearly", () => {
    const result = deserializeChangeSet(JSON.stringify(v1Document));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("ChangeSet validation failed");
    }
  });

  it("rejects a malformed v1 document (bad operation) instead of producing an invalid v2 set", () => {
    const malformedV1 = {
      ...v1Document,
      operations: [{ kind: "style-edit", id: "x" }],
    };
    expect(() => migrateChangeset_1_to_2(malformedV1)).toThrow();
  });
});
