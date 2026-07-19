import { describe, expect, it } from "vitest";

import { mergeChangeSets, mergeOperations } from "./index.js";
import {
  changeSetWith,
  duplicateOperation,
  insertOperation,
  removeElementOperation,
  styleEdit,
  unwrapOperation,
  wrapOperation,
} from "./test-support/change-ir-fixtures.js";

describe("mergeOperations structural cancellation", () => {
  it.each([
    ["insert/remove", [insertOperation("new-node"), removeElementOperation("new-node")]],
    ["remove/insert", [removeElementOperation("new-node"), insertOperation("new-node")]],
    [
      "duplicate/remove",
      [duplicateOperation("card-a", "card-a-copy"), removeElementOperation("card-a-copy")],
    ],
    ["wrap/unwrap", [wrapOperation("wrapper-1"), unwrapOperation("wrapper-1")]],
  ])("cancels %s inverse pairs", (_name, operations) => {
    expect(mergeOperations(operations)).toEqual([]);
  });

  it("preserves unmatched structural operations", () => {
    const operations = [insertOperation("node-x"), removeElementOperation("node-y")];
    expect(mergeOperations(operations).map((operation) => operation.id)).toEqual([
      "op-ins-node-x",
      "op-rem-node-y",
    ]);
  });

  it("finds an inverse pair around an unrelated operation", () => {
    const operations = [
      insertOperation("new-node"),
      styleEdit(),
      removeElementOperation("new-node"),
    ];
    expect(mergeOperations(operations).map((operation) => operation.id)).toEqual([
      "op-style-00001",
    ]);
  });

  it("cancels only the matched pair", () => {
    const operations = [
      insertOperation("node-a"),
      insertOperation("node-b"),
      removeElementOperation("node-a"),
    ];
    expect(mergeOperations(operations).map((operation) => operation.id)).toEqual(["op-ins-node-b"]);
  });
});

describe("mergeChangeSets structural behavior", () => {
  it.each([
    ["insert/remove", insertOperation("new-node"), removeElementOperation("new-node")],
    [
      "duplicate/remove",
      duplicateOperation("card-a", "card-a-copy"),
      removeElementOperation("card-a-copy"),
    ],
    ["wrap/unwrap", wrapOperation("wrapper-1"), unwrapOperation("wrapper-1")],
  ])("cancels %s across changesets", (_name, first, second) => {
    const result = mergeChangeSets(
      changeSetWith("cs-struct-a01", [first]),
      changeSetWith("cs-struct-b01", [second]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet.operations).toEqual([]);
  });

  it("preserves unmatched structural operations without silent drops", () => {
    const result = mergeChangeSets(
      changeSetWith("cs-struct-a02", [insertOperation("node-x"), wrapOperation("wrapper-keep")]),
      changeSetWith("cs-struct-b02", [
        removeElementOperation("node-y"),
        unwrapOperation("wrapper-other"),
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changeSet.operations).toHaveLength(4);
  });

  it.each([
    ["two inserts", insertOperation("dupe-node"), insertOperation("dupe-node")],
    ["two wraps", wrapOperation("shared-wrap"), wrapOperation("shared-wrap")],
  ])("reports $0 as a conflict", (_name, first, second) => {
    const result = mergeChangeSets(
      changeSetWith("cs-struct-a03", [first]),
      changeSetWith("cs-struct-b03", [second]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflicts).toHaveLength(1);
  });
});
