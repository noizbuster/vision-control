import { describe, expect, it } from "vitest";

import {
  type ChangeSet,
  createChangeSet,
  deserializeChangeSet,
  mergeChangeSets,
  mergeOperations,
  type Operation,
  serializeChangeSet,
} from "./index.js";

const BASE_TIME = 1_700_000_000_000;

const el = (runtimeId: string) => ({ runtimeId });

const opDefaults = { origin: "property-panel" as const, confidence: 1 };

const v2Defaults = {
  schemaVersion: "2.0.0" as const,
  workspaceId: "ws-merge-struct",
  page: { url: "https://localhost/page", title: null },
  viewport: { width: 1280, height: 720 },
  selectedTargets: [],
  sourceResolutions: [],
  verificationPlan: { assertions: [], notes: "test plan" },
  privacyReport: { redactions: [], totalRedacted: 0 },
};

const base = (id: string, ts: number) => ({
  id,
  timestamp: ts,
  runtime: false,
  ...opDefaults,
});

const csWith = (id: string, operations: readonly Operation[]): ChangeSet => ({
  ...v2Defaults,
  id,
  sessionId: "sess-merge-struct",
  operations: [...operations],
  createdAt: BASE_TIME,
  updatedAt: BASE_TIME,
  committed: false,
});

// --- structural operation fixtures ---

const insertOp = (elementId: string, parentId = "row-1"): Operation => ({
  ...base(`op-ins-${elementId}`, BASE_TIME),
  kind: "insert-element",
  element: el(elementId),
  parent: el(parentId),
  index: 0,
  tagName: "div",
  attributes: { class: "card" },
});

const removeOp = (elementId: string, parentId = "row-1"): Operation => ({
  ...base(`op-rem-${elementId}`, BASE_TIME + 1),
  kind: "remove-element",
  element: el(elementId),
  parent: el(parentId),
  index: 0,
  tagName: "div",
});

const duplicateOp = (sourceId: string, copyId: string): Operation => ({
  ...base(`op-dup-${copyId}`, BASE_TIME + 2),
  kind: "duplicate-element",
  source: el(sourceId),
  duplicate: el(copyId),
  parent: el("row-1"),
  index: 1,
  tagName: "div",
});

const wrapOp = (wrapperId: string): Operation => ({
  ...base(`op-wrp-${wrapperId}`, BASE_TIME + 3),
  kind: "wrap-elements",
  targets: [el("card-a"), el("card-b")],
  wrapper: el(wrapperId),
  parent: el("row-1"),
  tagName: "div",
});

const unwrapOp = (wrapperId: string): Operation => ({
  ...base(`op-unw-${wrapperId}`, BASE_TIME + 4),
  kind: "unwrap-element",
  wrapper: el(wrapperId),
  parent: el("row-1"),
  tagName: "div",
  targets: [el("card-a"), el("card-b")],
});

describe("mergeOperations — structural cancellation", () => {
  it("cancels a consecutive Insert+Remove on the same element", () => {
    const ops = [insertOp("new-node"), removeOp("new-node")];
    expect(mergeOperations(ops)).toEqual([]);
  });

  it("cancels a Duplicate+Remove targeting the duplicate (copy)", () => {
    const ops = [duplicateOp("card-a", "card-a-copy"), removeOp("card-a-copy")];
    expect(mergeOperations(ops)).toEqual([]);
  });

  it("cancels a Wrap+Unwrap on the same wrapper", () => {
    const ops = [wrapOp("wrapper-1"), unwrapOp("wrapper-1")];
    expect(mergeOperations(ops)).toEqual([]);
  });

  it("cancels regardless of order (Remove before Insert)", () => {
    const ops = [removeOp("new-node"), insertOp("new-node")];
    expect(mergeOperations(ops)).toEqual([]);
  });

  it("preserves unmatched structural operations", () => {
    const ops = [insertOp("node-x"), removeOp("node-y")];
    const merged = mergeOperations(ops);
    expect(merged).toHaveLength(2);
    expect(merged.map((o) => o.id)).toEqual(["op-ins-node-x", "op-rem-node-y"]);
  });

  it("preserves a non-structural op sitting between an inverse pair", () => {
    const styleEdit: Operation = {
      ...base("op-style-between", BASE_TIME + 5),
      kind: "style-edit",
      target: el("unrelated"),
      property: "color",
      value: "blue",
      important: false,
      previousValue: "red",
    };
    const ops = [insertOp("new-node"), styleEdit, removeOp("new-node")];
    const merged = mergeOperations(ops);
    // The style-edit is NOT a structural inverse of either, so the insert and
    // remove still find each other and cancel; the style-edit survives.
    expect(merged.map((o) => o.id)).toEqual(["op-style-between"]);
  });

  it("does not cancel an Insert of one element against a Remove of another", () => {
    const ops = [insertOp("node-a"), removeOp("node-b")];
    expect(mergeOperations(ops)).toHaveLength(2);
  });

  it("cancels only one pair when a single remove matches one of two inserts", () => {
    const ops = [insertOp("node-a"), insertOp("node-b"), removeOp("node-a")];
    const merged = mergeOperations(ops);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("op-ins-node-b");
  });
});

describe("mergeChangeSets — structural inverse pairs cancel across sets", () => {
  it("Insert in A + Remove in B on the same element cancel to an empty operation list", () => {
    const a = csWith("cs-a-ins", [insertOp("new-node")]);
    const b = csWith("cs-b-rem", [removeOp("new-node")]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet.operations).toEqual([]);
  });

  it("Duplicate in A + Remove in B targeting the copy cancel", () => {
    const a = csWith("cs-a-dup", [duplicateOp("card-a", "card-a-copy")]);
    const b = csWith("cs-b-rem", [removeOp("card-a-copy")]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet.operations).toEqual([]);
  });

  it("Wrap in A + Unwrap in B on the same wrapper cancel", () => {
    const a = csWith("cs-a-wrap", [wrapOp("wrapper-1")]);
    const b = csWith("cs-b-unwrap", [unwrapOp("wrapper-1")]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet.operations).toEqual([]);
  });

  it("preserves unmatched structural ops across a merge (no silent drop)", () => {
    const a = csWith("cs-a", [insertOp("node-x"), wrapOp("wrapper-keep")]);
    const b = csWith("cs-b", [removeOp("node-y"), unwrapOp("wrapper-other")]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet.operations).toHaveLength(4);
  });

  it("flags two inserts of the same element as a conflict (not a cancel)", () => {
    const a = csWith("cs-a", [insertOp("dupe-node")]);
    const b = csWith("cs-b", [insertOp("dupe-node")]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts).toHaveLength(1);
  });

  it("flags two wraps of the same wrapper as a conflict", () => {
    const a = csWith("cs-a", [wrapOp("shared-wrap")]);
    const b = csWith("cs-b", [wrapOp("shared-wrap")]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts).toHaveLength(1);
  });

  it("still allows an inverseOf-linked pair through (non-structural kinds)", () => {
    const styleForward: Operation = {
      ...base("op-style-fwd", BASE_TIME),
      kind: "style-edit",
      target: el("btn"),
      property: "color",
      value: "blue",
      important: false,
      previousValue: "red",
    };
    const styleInverse: Operation = {
      ...base("op-style-inv", BASE_TIME + 1),
      kind: "style-edit",
      target: el("btn"),
      property: "color",
      value: "red",
      important: false,
      previousValue: "blue",
      inverseOf: "op-style-fwd",
    };
    const a = csWith("cs-a", [styleForward]);
    const b = csWith("cs-b", [styleInverse]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(true);
  });
});

describe("mergeChangeSets — set-component-prop conflict signature (PRD §7.2)", () => {
  const range = { startLine: 5, startColumn: 10, endLine: 5, endColumn: 14 };
  const componentPropOp = (id: string, propName: string, value: string, previousValue: string): Operation => ({
    ...base(id, BASE_TIME),
    kind: "set-component-prop",
    target: el("btn-primary"),
    componentName: "Button",
    propName,
    value,
    previousValue,
    sourceRange: range,
  });

  it("flags two set-component-prop edits on the same target+prop as a conflict", () => {
    const a = csWith("cs-a", [componentPropOp("op-cprop-a1", "size", "lg", "md")]);
    const b = csWith("cs-b", [componentPropOp("op-cprop-b1", "size", "lg", "md")]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts).toHaveLength(1);
  });

  it("does NOT conflict when the propName differs (same component, different prop)", () => {
    const a = csWith("cs-a", [componentPropOp("op-cprop-a2", "size", "lg", "md")]);
    const b = csWith("cs-b", [componentPropOp("op-cprop-b2", "variant", "primary", "secondary")]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(true);
  });

  it("allows an inverseOf-linked component-prop pair through", () => {
    const a = csWith("cs-a", [componentPropOp("op-cprop-fwd", "size", "lg", "md")]);
    const b = csWith("cs-b", [
      { ...componentPropOp("op-cprop-inv", "size", "md", "lg"), inverseOf: "op-cprop-fwd" },
    ]);
    const result = mergeChangeSets(a, b);
    expect(result.ok).toBe(true);
  });
});

describe("serialization round-trip of merged structural changesets", () => {
  it("a merge result containing surviving structural ops round-trips deep-equal", () => {
    const a = csWith("cs-rt-a", [insertOp("survivor"), wrapOp("wrapper-rt")]);
    const b = csWith("cs-rt-b", [insertOp("extra")]);
    const result = mergeChangeSets(a, b);
    if (!result.ok) throw new Error("expected merge to succeed");
    const serialized = serializeChangeSet(result.changeSet);
    const deserialized = deserializeChangeSet(serialized);
    expect(deserialized.success).toBe(true);
    if (deserialized.success) {
      expect(deserialized.data.operations).toHaveLength(3);
      expect(deserialized.data.schemaVersion).toBe("2.0.0");
    }
  });

  it("an all-cancelled merge produces a valid empty-operation changeset", () => {
    const a = csWith("cs-empty-a", [insertOp("doomed")]);
    const b = csWith("cs-empty-b", [removeOp("doomed")]);
    const result = mergeChangeSets(a, b);
    if (!result.ok) throw new Error("expected merge to succeed");
    expect(result.changeSet.operations).toEqual([]);
    const roundTrip = deserializeChangeSet(serializeChangeSet(result.changeSet));
    expect(roundTrip.success).toBe(true);
    if (roundTrip.success) expect(roundTrip.data.operations).toEqual([]);
  });

  it("a standalone changeset built from every new kind round-trips through the factory", () => {
    let cs = createChangeSet({
      workspaceId: "ws-all-kinds",
      sessionId: "sess-all-kinds",
      id: "cs-allkinds-rt",
      now: BASE_TIME,
    });
    const allKinds: Operation[] = [
      insertOp("ins-1"),
      removeOp("rem-1"),
      duplicateOp("src-1", "copy-1"),
      wrapOp("wrap-1"),
      unwrapOp("wrap-2"),
    ];
    cs = { ...cs, operations: allKinds };
    const result = deserializeChangeSet(serializeChangeSet(cs));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.operations).toHaveLength(allKinds.length);
  });
});
