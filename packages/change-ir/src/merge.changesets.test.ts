import { describe, expect, it } from "vitest";

import {
  computeInverse,
  createChangeSet,
  deserializeChangeSet,
  mergeChangeSets,
  type Operation,
  serializeChangeSet,
  supersedeChangeSet,
} from "./index.js";
import {
  BASE_TIME,
  changeSetWith,
  elementRef,
  insertOperation,
  styleEdit,
  wrapOperation,
} from "./test-support/change-ir-fixtures.js";

describe("mergeChangeSets", () => {
  it("merges non-conflicting operations into canonical 2.1.0", () => {
    const textEdit: Operation = {
      id: "op-merge-text01",
      timestamp: BASE_TIME,
      runtime: false,
      origin: "property-panel",
      confidence: 1,
      kind: "text-edit",
      target: elementRef("label-other"),
      newText: "New",
    };
    const result = mergeChangeSets(
      changeSetWith("cs-merge-a001", [styleEdit()]),
      changeSetWith("cs-merge-b001", [textEdit]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changeSet.operations).toHaveLength(2);
      expect(result.changeSet.schemaVersion).toBe("2.1.0");
    }
  });

  it("rejects same-target CSS edits without an inverse", () => {
    const conflict: Operation = {
      id: "op-conflict001",
      timestamp: BASE_TIME,
      runtime: false,
      origin: "property-panel",
      confidence: 1,
      kind: "style-edit",
      target: elementRef("btn-primary"),
      property: "color",
      value: "green",
      important: false,
      previousValue: "red",
    };
    const result = mergeChangeSets(
      changeSetWith("cs-merge-a002", [styleEdit()]),
      changeSetWith("cs-merge-b002", [conflict]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts).toHaveLength(1);
  });

  it("allows an inverse-linked CSS pair", () => {
    const forward = styleEdit();
    const result = mergeChangeSets(
      changeSetWith("cs-merge-a003", [forward]),
      changeSetWith("cs-merge-b003", [computeInverse(forward)]),
    );
    expect(result.ok).toBe(true);
  });

  it("supersedes an old changeset without changing the replacement", () => {
    const old = changeSetWith("cs-supersede-old", [styleEdit()]);
    const next = createChangeSet({ workspaceId: "ws-next-0001", sessionId: "sess-next-0001" });
    const result = supersedeChangeSet(old, next);
    expect(result.old.supersededBy).toBe(next.id);
    expect(result.next).toBe(next);
  });

  it("round-trips surviving structural operations after merge", () => {
    const result = mergeChangeSets(
      changeSetWith("cs-roundtrip-a", [insertOperation("survivor"), wrapOperation("wrapper-rt")]),
      changeSetWith("cs-roundtrip-b", [insertOperation("extra")]),
    );
    if (!result.ok) throw new Error("expected merge success");
    const deserialized = deserializeChangeSet(serializeChangeSet(result.changeSet));
    expect(deserialized.success).toBe(true);
    if (deserialized.success) {
      expect(deserialized.data.operations).toHaveLength(3);
      expect(deserialized.data.schemaVersion).toBe("2.1.0");
    }
  });
});

describe("set-component-prop conflict slots", () => {
  const componentProp = (id: string, propName: string): Operation => ({
    id,
    timestamp: BASE_TIME,
    runtime: false,
    origin: "property-panel",
    confidence: 1,
    kind: "set-component-prop",
    target: elementRef("btn-primary"),
    componentName: "Button",
    propName,
    value: "lg",
    previousValue: "md",
    sourceRange: { startLine: 5, startColumn: 10, endLine: 5, endColumn: 14 },
  });

  it("conflicts on the same component property and not on a different property", () => {
    const same = mergeChangeSets(
      changeSetWith("cs-prop-a001", [componentProp("op-cprop-a1", "size")]),
      changeSetWith("cs-prop-b001", [componentProp("op-cprop-b1", "size")]),
    );
    const different = mergeChangeSets(
      changeSetWith("cs-prop-a002", [componentProp("op-cprop-a2", "size")]),
      changeSetWith("cs-prop-b002", [componentProp("op-cprop-b2", "variant")]),
    );
    expect(same.ok).toBe(false);
    expect(different.ok).toBe(true);
  });
});
