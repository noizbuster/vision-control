import { describe, expect, it } from "vitest";

import {
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

const opDefaults = { origin: "property-panel" as const, confidence: 1 };

const v2Defaults = {
  schemaVersion: "2.0.0" as const,
  workspaceId: "ws-struct-test",
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
  ...opDefaults,
});

const removeStyleOp: Operation = {
  ...base("op-rmstyle0001", BASE_TIME),
  kind: "remove-style",
  target: el("btn-primary"),
  property: "color",
  previousValue: "red",
  important: true,
};

const setAttributeOp: Operation = {
  ...base("op-setattr0001", BASE_TIME + 1),
  kind: "set-attribute",
  target: el("btn-primary"),
  name: "aria-label",
  value: "Submit",
  previousValue: "Send",
};

const positionElementOp: Operation = {
  ...base("op-position001", BASE_TIME + 2),
  kind: "position-element",
  target: el("card-a"),
  property: "position",
  fromValue: "static",
  toValue: "relative",
};

const insertElementOp: Operation = {
  ...base("op-insert0001", BASE_TIME + 3),
  kind: "insert-element",
  element: el("new-node-1"),
  parent: el("row-1"),
  index: 0,
  tagName: "div",
  attributes: { class: "card" },
};

const removeElementOp: Operation = {
  ...base("op-remove0001", BASE_TIME + 4),
  kind: "remove-element",
  element: el("old-node-1"),
  parent: el("row-1"),
  index: 2,
  tagName: "span",
};

const duplicateElementOp: Operation = {
  ...base("op-duplic0001", BASE_TIME + 5),
  kind: "duplicate-element",
  source: el("card-a"),
  duplicate: el("card-a-copy"),
  parent: el("row-1"),
  index: 1,
  tagName: "div",
};

const wrapElementsOp: Operation = {
  ...base("op-wrap00001", BASE_TIME + 6),
  kind: "wrap-elements",
  targets: [el("card-a"), el("card-b")],
  wrapper: el("wrapper-1"),
  parent: el("row-1"),
  tagName: "div",
};

const unwrapElementOp: Operation = {
  ...base("op-unwrap0001", BASE_TIME + 7),
  kind: "unwrap-element",
  wrapper: el("wrapper-2"),
  parent: el("row-1"),
  tagName: "section",
  targets: [el("card-a"), el("card-b")],
};

const newOps: ReadonlyArray<readonly [string, Operation]> = [
  ["remove-style", removeStyleOp],
  ["set-attribute", setAttributeOp],
  ["position-element", positionElementOp],
  ["insert-element", insertElementOp],
  ["remove-element", removeElementOp],
  ["duplicate-element", duplicateElementOp],
  ["wrap-elements", wrapElementsOp],
  ["unwrap-element", unwrapElementOp],
];

describe("structural operation schema validation (PRD §12.3)", () => {
  it.each(newOps)("accepts a valid %s operation", (_kind, op) => {
    expect(OperationSchema.safeParse(op).success).toBe(true);
  });

  it("rejects a wrap-elements with no targets", () => {
    const bad = { ...wrapElementsOp, targets: [] } as unknown as Operation;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an insert-element with a negative index", () => {
    const bad = { ...insertElementOp, index: -1 } as unknown as Operation;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a set-attribute missing the name", () => {
    const { name: _omit, ...bad } = setAttributeOp;
    void _omit;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a position-element with a non-position property", () => {
    const bad = { ...positionElementOp, property: "display" } as unknown as Operation;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });
});

describe("computeInverse — every new kind has a computable inverse (Appendix D.5)", () => {
  it.each(newOps)("produces a schema-valid inverse for %s", (_kind, op) => {
    const inverse = computeInverse(op);
    expect(inverse.id).not.toBe(op.id);
    expect(inverse.inverseOf).toBe(op.id);
    expect(inverse.runtime).toBe(op.runtime);
    expect(OperationSchema.safeParse(inverse).success).toBe(true);
  });

  it("remove-style inverse is a style-edit restoring the removed value", () => {
    const inv = computeInverse(removeStyleOp);
    expect(inv.kind).toBe("style-edit");
    if (inv.kind !== "style-edit") throw new Error("expected style-edit");
    expect(inv.property).toBe("color");
    expect(inv.value).toBe("red");
    expect(inv.important).toBe(true);
    expect(inv.target.runtimeId).toBe("btn-primary");
  });

  it("set-attribute inverse swaps value and previousValue", () => {
    const inv = computeInverse(setAttributeOp);
    if (inv.kind !== "set-attribute") throw new Error("expected set-attribute");
    expect(inv.name).toBe("aria-label");
    expect(inv.value).toBe("Send");
    expect(inv.previousValue).toBe("Submit");
  });

  it("position-element inverse swaps from/to position values", () => {
    const inv = computeInverse(positionElementOp);
    if (inv.kind !== "position-element") throw new Error("expected position-element");
    expect(inv.fromValue).toBe("relative");
    expect(inv.toValue).toBe("static");
  });

  it("insert-element inverse is remove-element (mutual inverses)", () => {
    const inv = computeInverse(insertElementOp);
    expect(inv.kind).toBe("remove-element");
    if (inv.kind !== "remove-element") throw new Error("expected remove-element");
    expect(inv.element.runtimeId).toBe("new-node-1");
    expect(inv.parent.runtimeId).toBe("row-1");
    expect(inv.index).toBe(0);
    expect(inv.tagName).toBe("div");
  });

  it("remove-element inverse is insert-element (mutual inverses)", () => {
    const inv = computeInverse(removeElementOp);
    expect(inv.kind).toBe("insert-element");
    if (inv.kind !== "insert-element") throw new Error("expected insert-element");
    expect(inv.element.runtimeId).toBe("old-node-1");
    expect(inv.index).toBe(2);
  });

  it("duplicate-element inverse is remove-element targeting the copy", () => {
    const inv = computeInverse(duplicateElementOp);
    expect(inv.kind).toBe("remove-element");
    if (inv.kind !== "remove-element") throw new Error("expected remove-element");
    expect(inv.element.runtimeId).toBe("card-a-copy");
    expect(inv.parent.runtimeId).toBe("row-1");
  });

  it("wrap-elements inverse is unwrap-element (mutual inverses)", () => {
    const inv = computeInverse(wrapElementsOp);
    expect(inv.kind).toBe("unwrap-element");
    if (inv.kind !== "unwrap-element") throw new Error("expected unwrap-element");
    expect(inv.wrapper.runtimeId).toBe("wrapper-1");
    expect(inv.targets).toHaveLength(2);
    expect(inv.tagName).toBe("div");
  });

  it("unwrap-element inverse is wrap-elements (mutual inverses)", () => {
    const inv = computeInverse(unwrapElementOp);
    expect(inv.kind).toBe("wrap-elements");
    if (inv.kind !== "wrap-elements") throw new Error("expected wrap-elements");
    expect(inv.wrapper.runtimeId).toBe("wrapper-2");
    expect(inv.targets).toHaveLength(2);
  });
});

describe("double-inverse restores the original shape (self-symmetric kinds)", () => {
  // remove-style and duplicate-element are excluded: their documented inverse
  // crosses to a different kind (style-edit / remove-element), so the
  // double-inverse cannot return the original kind by construction.
  const selfSymmetric: ReadonlyArray<readonly [string, Operation]> = [
    ["set-attribute", setAttributeOp],
    ["position-element", positionElementOp],
    ["insert-element", insertElementOp],
    ["remove-element", removeElementOp],
    ["wrap-elements", wrapElementsOp],
    ["unwrap-element", unwrapElementOp],
  ];

  it.each(selfSymmetric)("computeInverse twice restores the original %s shape", (_kind, op) => {
    const once = computeInverse(op);
    const twice = computeInverse(once);
    expect(twice.kind).toBe(op.kind);
    const { id: _twiceId, inverseOf: _twiceInv, timestamp: _twiceTs, ...twiceRest } = twice;
    void _twiceId;
    void _twiceInv;
    void _twiceTs;
    const { id: _opId, inverseOf: _opInv, timestamp: _opTs, ...opRest } = op;
    void _opId;
    void _opInv;
    void _opTs;
    expect(twiceRest).toEqual(opRest);
  });

  it("insert and remove are mutual inverses across both directions", () => {
    expect(computeInverse(insertElementOp).kind).toBe("remove-element");
    expect(computeInverse(removeElementOp).kind).toBe("insert-element");
  });

  it("wrap and unwrap are mutual inverses across both directions", () => {
    expect(computeInverse(wrapElementsOp).kind).toBe("unwrap-element");
    expect(computeInverse(unwrapElementOp).kind).toBe("wrap-elements");
  });
});

describe("structural serialization round-trip", () => {
  const fixedChangeSet = (): ChangeSet => ({
    ...v2Defaults,
    id: "cs-structrt0001",
    sessionId: "sess-structrt",
    operations: [
      removeStyleOp,
      setAttributeOp,
      positionElementOp,
      insertElementOp,
      removeElementOp,
      duplicateElementOp,
      wrapElementsOp,
      unwrapElementOp,
    ],
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME + 1,
    committed: false,
  });

  it("serialize -> deserialize round-trips a structural changeset deep-equal", () => {
    const cs = fixedChangeSet();
    const serialized = serializeChangeSet(cs);
    const result = deserializeChangeSet(serialized);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(cs);
      expect(serializeChangeSet(result.data)).toBe(serialized);
    }
  });

  it("a changeset containing every new kind round-trips through append", () => {
    let cs = createChangeSet({
      workspaceId: "ws-all-struct",
      sessionId: "sess-all-struct",
      id: "cs-allstruct001",
      now: BASE_TIME,
    });
    for (const [, op] of newOps) cs = { ...cs, operations: [...cs.operations, op] };
    const result = deserializeChangeSet(serializeChangeSet(cs));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.operations).toHaveLength(newOps.length);
  });

  it("rejects a changeset missing a required structural field", () => {
    const cs = fixedChangeSet();
    const serialized = serializeChangeSet(cs);
    const mutated = JSON.parse(serialized) as { operations: unknown[] };
    const insert = mutated.operations[3] as Record<string, unknown>;
    delete insert.parent;
    const result = deserializeChangeSet(JSON.stringify(mutated));
    expect(result.success).toBe(false);
  });
});
