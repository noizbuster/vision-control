import { beforeEach, describe, expect, it } from "vitest";
import {
  childTexts,
  makeDuplicateElement,
  makeGridReorder,
  makeInsertElement,
  makeRemoveElement,
  makeUnwrapElement,
  makeWrapElements,
} from "./__fixtures__/helpers.js";
import {
  registerParentWithChildren,
  resetDispatchTestDom,
  setupDispatchTest,
} from "./operation-dispatch.test-fixtures.js";

describe("structural operation dispatch", () => {
  beforeEach(resetDispatchTestDom);

  it("moves child C (index 2) to index 0 in dom-order placement", () => {
    const { manager, dom } = setupDispatchTest();
    const parent = registerParentWithChildren(dom, "rt-grid0001", ["A", "B", "C"]);

    manager.applyOperation(makeGridReorder("rt-grid0001", "rt-c30001", "dom-order", 2, 0));

    expect(childTexts(parent)).toEqual(["C", "A", "B"]);
  });

  it("rollback restores original order", () => {
    const { manager, dom } = setupDispatchTest();
    const parent = registerParentWithChildren(dom, "rt-grid0001", ["A", "B", "C"]);

    const rollback = manager.applyOperation(
      makeGridReorder("rt-grid0001", "rt-c30001", "dom-order", 2, 0),
    );
    expect(childTexts(parent)).toEqual(["C", "A", "B"]);

    rollback();
    expect(childTexts(parent)).toEqual(["A", "B", "C"]);
  });

  it("grid-area placement applies CSS without DOM reordering", () => {
    const { manager, dom } = setupDispatchTest();
    const parent = registerParentWithChildren(dom, "rt-grid0001", ["A", "B", "C"]);

    manager.applyOperation(makeGridReorder("rt-grid0001", "rt-c10001", "grid-area", 0, 0, "2 / 3"));

    expect(childTexts(parent)).toEqual(["A", "B", "C"]);
    expect(manager.stylesheet.ruleCount()).toBe(1);
  });

  it("insert-element adds a node and rollback removes it", () => {
    const { manager, dom } = setupDispatchTest();
    const parent = registerParentWithChildren(dom, "rt-parent001", ["A", "B"]);

    const rollback = manager.applyOperation(
      makeInsertElement("rt-new00001", "rt-parent001", 1, "span", { id: "new" }),
    );
    expect(parent.children.length).toBe(3);
    expect(parent.children[1]?.tagName).toBe("SPAN");

    rollback();
    expect(parent.children.length).toBe(2);
  });

  it("remove-element removes a node and rollback re-inserts it", () => {
    const { manager, dom } = setupDispatchTest();
    const parent = registerParentWithChildren(dom, "rt-parent001", ["A", "B", "C"]);

    const rollback = manager.applyOperation(
      makeRemoveElement("rt-c20001", "rt-parent001", 1, "div"),
    );
    expect(childTexts(parent)).toEqual(["A", "C"]);

    rollback();
    expect(childTexts(parent)).toEqual(["A", "B", "C"]);
  });

  it("duplicate-element clones and rollback removes the clone", () => {
    const { manager, dom } = setupDispatchTest();
    const parent = registerParentWithChildren(dom, "rt-parent001", ["A", "B"]);

    const rollback = manager.applyOperation(
      makeDuplicateElement("rt-c10001", "rt-dup00001", "rt-parent001", 0, "div"),
    );
    expect(parent.children.length).toBe(3);

    rollback();
    expect(parent.children.length).toBe(2);
  });

  it("wrap-elements wraps targets and rollback unwraps", () => {
    const { manager, dom } = setupDispatchTest();
    const parent = registerParentWithChildren(dom, "rt-parent001", ["A", "B", "C"]);

    const rollback = manager.applyOperation(
      makeWrapElements(["rt-c10001", "rt-c20001"], "rt-wrap0001", "rt-parent001", "section"),
    );
    expect(parent.querySelector("section")?.children.length).toBe(2);

    rollback();
    expect(parent.querySelector("section")).toBeNull();
    expect(childTexts(parent)).toEqual(["A", "B", "C"]);
  });

  it("unwrap-element promotes children and rollback re-wraps", () => {
    const { manager, dom } = setupDispatchTest();
    const parent = document.createElement("div");
    dom.registerElement("rt-parent001", parent);
    document.body.appendChild(parent);
    const wrapper = document.createElement("section");
    dom.registerElement("rt-wrap0001", wrapper);
    const inner = document.createElement("div");
    inner.textContent = "inner";
    dom.registerElement("rt-inner001", inner);
    wrapper.appendChild(inner);
    parent.appendChild(wrapper);

    const rollback = manager.applyOperation(
      makeUnwrapElement("rt-wrap0001", "rt-parent001", "section", ["rt-inner001"]),
    );
    expect(parent.querySelector("section")).toBeNull();
    expect(parent.contains(inner)).toBe(true);

    rollback();
    expect(parent.querySelector("section")?.contains(inner)).toBe(true);
  });
});
