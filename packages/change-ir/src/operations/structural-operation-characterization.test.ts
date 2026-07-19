import { describe, expect, it } from "vitest";

import { computeInverse, type Operation, OperationSchema } from "../index.js";
import {
  BASE_TIME,
  duplicateOperation,
  elementRef,
  insertOperation,
  operationDefaults,
  removeElementOperation,
  unwrapOperation,
  wrapOperation,
} from "../test-support/change-ir-fixtures.js";

const removeStyle: Operation = {
  id: "op-rmstyle0001",
  timestamp: BASE_TIME,
  runtime: false,
  ...operationDefaults,
  kind: "remove-style",
  target: elementRef("btn-primary"),
  property: "color",
  previousValue: "red",
  important: true,
};

const setAttribute: Operation = {
  id: "op-setattr0001",
  timestamp: BASE_TIME + 1,
  runtime: false,
  ...operationDefaults,
  kind: "set-attribute",
  target: elementRef("btn-primary"),
  name: "aria-label",
  value: "Submit",
  previousValue: "Send",
};

const setComponentProp: Operation = {
  id: "op-setcompp0001",
  timestamp: BASE_TIME + 2,
  runtime: false,
  ...operationDefaults,
  kind: "set-component-prop",
  target: elementRef("btn-primary"),
  componentName: "Button",
  propName: "size",
  value: "lg",
  previousValue: "md",
  sourceRange: { startLine: 12, startColumn: 16, endLine: 12, endColumn: 20 },
};

const positionElement: Operation = {
  id: "op-position001",
  timestamp: BASE_TIME + 3,
  runtime: false,
  ...operationDefaults,
  kind: "position-element",
  target: elementRef("card-a"),
  property: "position",
  fromValue: "static",
  toValue: "relative",
};

describe("structural operation characterization", () => {
  it("restores a removed style with all literal fields", () => {
    const inverse = computeInverse(removeStyle);
    if (inverse.kind !== "style-edit") throw new Error("expected style-edit");
    expect({
      property: inverse.property,
      value: inverse.value,
      important: inverse.important,
      target: inverse.target.runtimeId,
    }).toEqual({ property: "color", value: "red", important: true, target: "btn-primary" });
  });

  it("swaps attribute values", () => {
    const inverse = computeInverse(setAttribute);
    if (inverse.kind !== "set-attribute") throw new Error("expected set-attribute");
    expect({
      name: inverse.name,
      value: inverse.value,
      previousValue: inverse.previousValue,
    }).toEqual({ name: "aria-label", value: "Send", previousValue: "Submit" });
  });

  it("swaps component values and preserves source range", () => {
    const inverse = computeInverse(setComponentProp);
    if (inverse.kind !== "set-component-prop") throw new Error("expected set-component-prop");
    expect({
      componentName: inverse.componentName,
      propName: inverse.propName,
      value: inverse.value,
      previousValue: inverse.previousValue,
      sourceRange: inverse.sourceRange,
    }).toEqual({
      componentName: "Button",
      propName: "size",
      value: "md",
      previousValue: "lg",
      sourceRange: setComponentProp.sourceRange,
    });
  });

  it("rejects malformed attribute, component, and position fields", () => {
    const { name: _name, ...missingName } = setAttribute;
    const { sourceRange: _range, ...missingRange } = setComponentProp;
    expect(OperationSchema.safeParse(missingName).success).toBe(false);
    expect(OperationSchema.safeParse(missingRange).success).toBe(false);
    expect(OperationSchema.safeParse({ ...positionElement, property: "display" }).success).toBe(
      false,
    );
  });

  it("swaps position values", () => {
    const inverse = computeInverse(positionElement);
    if (inverse.kind !== "position-element") throw new Error("expected position-element");
    expect({ fromValue: inverse.fromValue, toValue: inverse.toValue }).toEqual({
      fromValue: "relative",
      toValue: "static",
    });
  });

  it.each([
    [insertOperation("new-node-1"), "remove-element", "new-node-1", 0, "div"],
    [removeElementOperation("old-node-1"), "insert-element", "old-node-1", 2, "span"],
    [duplicateOperation("card-a", "card-a-copy"), "remove-element", "card-a-copy", 1, "div"],
  ] as const)("preserves literal element metadata for $1 inverse", (operation, kind, id, index, tagName) => {
    const inverse = computeInverse(operation);
    expect(inverse.kind).toBe(kind);
    if (inverse.kind !== "insert-element" && inverse.kind !== "remove-element") {
      throw new Error("expected element inverse");
    }
    expect({
      element: inverse.element.runtimeId,
      parent: inverse.parent.runtimeId,
      index: inverse.index,
      tagName: inverse.tagName,
    }).toEqual({ element: id, parent: "row-1", index, tagName });
  });

  it.each([
    [wrapOperation("wrapper-1"), "unwrap-element", "wrapper-1", "div"],
    [unwrapOperation("wrapper-2"), "wrap-elements", "wrapper-2", "section"],
  ] as const)("preserves literal wrapper metadata for $1 inverse", (operation, kind, wrapper, tagName) => {
    const inverse = computeInverse(operation);
    expect(inverse.kind).toBe(kind);
    if (inverse.kind !== "wrap-elements" && inverse.kind !== "unwrap-element") {
      throw new Error("expected wrapper inverse");
    }
    expect({
      wrapper: inverse.wrapper.runtimeId,
      targets: inverse.targets.length,
      tagName: inverse.tagName,
    }).toEqual({ wrapper, targets: 2, tagName });
  });

  it("restores non-default remove and unwrap metadata after two inversions", () => {
    const restoredRemove = computeInverse(computeInverse(removeElementOperation("old-node-1")));
    const restoredUnwrap = computeInverse(computeInverse(unwrapOperation("wrapper-2")));
    if (restoredRemove.kind !== "remove-element" || restoredUnwrap.kind !== "unwrap-element") {
      throw new Error("expected restored structural operations");
    }
    expect({ index: restoredRemove.index, tagName: restoredRemove.tagName }).toEqual({
      index: 2,
      tagName: "span",
    });
    expect(restoredUnwrap.tagName).toBe("section");
  });

  it.each([
    setAttribute,
    setComponentProp,
    positionElement,
    insertOperation("new-node-1"),
    removeElementOperation("old-node-1"),
    wrapOperation("wrapper-1"),
    unwrapOperation("wrapper-2"),
  ])("restores the semantic shape of $kind after two inversions", (operation) => {
    const restored = computeInverse(computeInverse(operation));
    const {
      id: _restoredId,
      inverseOf: _restoredInverse,
      timestamp: _restoredTime,
      ...restoredShape
    } = restored;
    const { id: _id, inverseOf: _inverse, timestamp: _time, ...operationShape } = operation;
    expect(restoredShape).toEqual(operationShape);
  });
});
