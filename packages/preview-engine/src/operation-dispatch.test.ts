/**
 * Operation dispatch tests: every operation kind dispatches without throwing,
 * grid-reorder mutates DOM order, unknown kinds raise a typed error, and the
 * R7 preview-clear-before-verify invariant (activeCount === 0 after clearAll)
 * holds.
 */

import type { Operation } from "@vision-control/change-ir";
import { beforeEach, describe, expect, it } from "vitest";
import {
  childTexts,
  createTestDomAdapter,
  elementRef,
  FakeMutationObserver,
  makeAlignElements,
  makeBreakpointClassEdit,
  makeBreakpointStyleEdit,
  makeBreakpointTextEdit,
  makeDistributeElements,
  makeDuplicateElement,
  makeGridReorder,
  makeGridSpan,
  makeGroupReorder,
  makeGroupReparent,
  makeInsertElement,
  makeMultiSelectGroup,
  makePositionElement,
  makeRemoveElement,
  makeRemoveStyle,
  makeScreenshotCropRef,
  makeSetAttribute,
  makeSetChildSizing,
  makeSetContainerLayout,
  makeSuggestedDiff,
  makeUnwrapElement,
  makeWrapElements,
  resetOpCounter,
} from "./__fixtures__/helpers.js";
import {
  createPreviewManager,
  type PreviewDomAdapter,
  type PreviewManager,
  UnsupportedPreviewOperationError,
} from "./index.js";

function setup(): { manager: PreviewManager; dom: PreviewDomAdapter } {
  const dom = createTestDomAdapter(FakeMutationObserver);
  const manager = createPreviewManager({ dom });
  return { manager, dom };
}

function regDiv(dom: PreviewDomAdapter, id: string, text?: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text ?? id;
  dom.registerElement(id, el);
  return el;
}

/** Build a parent with three labeled children, all registered. */
function regParentWithChildren(
  dom: PreviewDomAdapter,
  parentId: string,
  labels: readonly string[],
): HTMLElement {
  const parent = document.createElement("div");
  dom.registerElement(parentId, parent);
  document.body.appendChild(parent);
  for (const [id, label] of labels.map((l, i) => [`rt-c${i + 1}0001`, l] as const)) {
    const child = document.createElement("div");
    child.textContent = label;
    child.id = id;
    dom.registerElement(id, child);
    parent.appendChild(child);
  }
  return parent;
}

describe("preview-engine operation dispatch", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.querySelectorAll("style[data-vc-preview-stylesheet]").forEach((el) => {
      el.remove();
    });
    resetOpCounter();
    FakeMutationObserver.instances.length = 0;
  });

  describe("all 22 previously-throwing kinds dispatch without throwing", () => {
    it("dispatches the 14 V1 kinds", () => {
      const { manager, dom } = setup();
      regDiv(dom, "rt-target001");
      regParentWithChildren(dom, "rt-parent001", ["A", "B", "C"]);
      regDiv(dom, "rt-container1", "container");

      const ops: Operation[] = [
        makeMultiSelectGroup("grp-1", [elementRef("rt-c10001"), elementRef("rt-c20001")]),
        makeGroupReorder(
          "rt-parent001",
          [elementRef("rt-c10001"), elementRef("rt-c20001"), elementRef("rt-c30001")],
          [0, 1, 2],
          [2, 0, 1],
        ),
        makeGroupReparent([elementRef("rt-c10001")], "rt-parent001", [0], "rt-container1", [0]),
        makeAlignElements([elementRef("rt-c10001"), elementRef("rt-c20001")], "left"),
        makeDistributeElements(
          [elementRef("rt-c10001"), elementRef("rt-c20001")],
          "horizontal",
          "equal-gap",
        ),
        makeSetContainerLayout("rt-container1", "display", "flex"),
        makeSetChildSizing("rt-container1", "rt-c10001", 0, "fill", "flex: 1"),
        makeGridReorder("rt-parent001", "rt-c30001", "dom-order", 2, 0),
        makeGridSpan("rt-parent001", "rt-c10001", "column", 1, 3),
        makeBreakpointStyleEdit("rt-target001", "md", "color", "red"),
        makeBreakpointClassEdit("rt-target001", "md", "old", "new"),
        makeBreakpointTextEdit("rt-target001", "md", "breakpoint text"),
        makeScreenshotCropRef("art-1", { x: 0, y: 0, width: 10, height: 10 }),
        makeSuggestedDiff("@@ diff @@"),
      ];

      for (const op of ops) {
        expect(() => manager.applyOperation(op)).not.toThrow();
      }
      manager.clearAll();
    });

    it("dispatches the 8 structural kinds added in Task 6", () => {
      const { manager, dom } = setup();
      regDiv(dom, "rt-target001", "target");
      regParentWithChildren(dom, "rt-parent001", ["A", "B", "C"]);

      const ops: Operation[] = [
        makeRemoveStyle("rt-target001", "color"),
        makeSetAttribute("rt-target001", "data-x", "value"),
        makePositionElement("rt-target001", "static", "relative"),
        makeInsertElement("rt-new00001", "rt-parent001", 0, "span"),
        makeRemoveElement("rt-c20001", "rt-parent001", 1, "div"),
        makeDuplicateElement("rt-c10001", "rt-dup00001", "rt-parent001", 0, "div"),
        makeWrapElements(["rt-c10001", "rt-c20001"], "rt-wrap0001", "rt-parent001", "section"),
        makeUnwrapElement("rt-wrap0001", "rt-parent001", "section", ["rt-c10001"]),
      ];

      for (const op of ops) {
        expect(() => manager.applyOperation(op)).not.toThrow();
      }
      manager.clearAll();
    });
  });

  describe("grid-reorder mutates DOM order", () => {
    it("moves child C (index 2) to index 0 in dom-order placement", () => {
      const { manager, dom } = setup();
      const parent = regParentWithChildren(dom, "rt-grid0001", ["A", "B", "C"]);

      manager.applyOperation(makeGridReorder("rt-grid0001", "rt-c30001", "dom-order", 2, 0));

      expect(childTexts(parent)).toEqual(["C", "A", "B"]);
    });

    it("rollback restores original order", () => {
      const { manager, dom } = setup();
      const parent = regParentWithChildren(dom, "rt-grid0001", ["A", "B", "C"]);

      const rollback = manager.applyOperation(
        makeGridReorder("rt-grid0001", "rt-c30001", "dom-order", 2, 0),
      );
      expect(childTexts(parent)).toEqual(["C", "A", "B"]);

      rollback();
      expect(childTexts(parent)).toEqual(["A", "B", "C"]);
    });

    it("grid-area placement applies a CSS rule without DOM reordering", () => {
      const { manager, dom } = setup();
      const parent = regParentWithChildren(dom, "rt-grid0001", ["A", "B", "C"]);

      manager.applyOperation(
        makeGridReorder("rt-grid0001", "rt-c10001", "grid-area", 0, 0, "2 / 3"),
      );

      expect(childTexts(parent)).toEqual(["A", "B", "C"]);
      expect(manager.stylesheet.ruleCount()).toBe(1);
    });
  });

  describe("structural mutation kinds mutate and restore DOM", () => {
    it("insert-element adds a node and rollback removes it", () => {
      const { manager, dom } = setup();
      const parent = regParentWithChildren(dom, "rt-parent001", ["A", "B"]);

      const rollback = manager.applyOperation(
        makeInsertElement("rt-new00001", "rt-parent001", 1, "span", { id: "new" }),
      );
      expect(parent.children.length).toBe(3);
      expect((parent.children[1] as HTMLElement).tagName).toBe("SPAN");

      rollback();
      expect(parent.children.length).toBe(2);
    });

    it("remove-element removes a node and rollback re-inserts it", () => {
      const { manager, dom } = setup();
      const parent = regParentWithChildren(dom, "rt-parent001", ["A", "B", "C"]);

      const rollback = manager.applyOperation(
        makeRemoveElement("rt-c20001", "rt-parent001", 1, "div"),
      );
      expect(childTexts(parent)).toEqual(["A", "C"]);

      rollback();
      expect(childTexts(parent)).toEqual(["A", "B", "C"]);
    });

    it("duplicate-element clones and rollback removes the clone", () => {
      const { manager, dom } = setup();
      const parent = regParentWithChildren(dom, "rt-parent001", ["A", "B"]);

      const rollback = manager.applyOperation(
        makeDuplicateElement("rt-c10001", "rt-dup00001", "rt-parent001", 0, "div"),
      );
      expect(parent.children.length).toBe(3);

      rollback();
      expect(parent.children.length).toBe(2);
    });

    it("wrap-elements wraps targets and rollback unwraps", () => {
      const { manager, dom } = setup();
      const parent = regParentWithChildren(dom, "rt-parent001", ["A", "B", "C"]);

      const rollback = manager.applyOperation(
        makeWrapElements(["rt-c10001", "rt-c20001"], "rt-wrap0001", "rt-parent001", "section"),
      );
      const wrapper = parent.querySelector("section");
      expect(wrapper).not.toBeNull();
      expect(wrapper?.children.length).toBe(2);

      rollback();
      expect(parent.querySelector("section")).toBeNull();
      expect(childTexts(parent)).toEqual(["A", "B", "C"]);
    });

    it("unwrap-element promotes children and rollback re-wraps", () => {
      const { manager, dom } = setup();
      const parent = document.createElement("div");
      dom.registerElement("rt-parent001", parent);
      document.body.appendChild(parent);
      const wrapper = document.createElement("section");
      wrapper.id = "wrap";
      dom.registerElement("rt-wrap0001", wrapper);
      const inner = document.createElement("div");
      inner.textContent = "inner";
      inner.id = "rt-inner001";
      dom.registerElement("rt-inner001", inner);
      wrapper.appendChild(inner);
      parent.appendChild(wrapper);

      const rollback = manager.applyOperation(
        makeUnwrapElement("rt-wrap0001", "rt-parent001", "section", ["rt-inner001"]),
      );
      expect(parent.querySelector("section")).toBeNull();
      expect(parent.contains(inner)).toBe(true);

      rollback();
      expect(parent.querySelector("section")).not.toBeNull();
      expect(parent.querySelector("section")?.contains(inner)).toBe(true);
    });
  });

  describe("CSS-rule kinds apply stylesheets", () => {
    it("remove-style, position-element, container-layout, child-sizing, grid-span, breakpoint-style apply rules", () => {
      const { manager, dom } = setup();
      // Each op targets a distinct element: the stylesheet manager keys rules
      // by selector (runtimeId), so a shared id would collapse to one rule.
      regDiv(dom, "rt-rmst001");
      regDiv(dom, "rt-pos0001");
      regDiv(dom, "rt-cont0001");
      regDiv(dom, "rt-chld0001");
      regDiv(dom, "rt-grch0001");
      regDiv(dom, "rt-bpse0001");

      const ops: Operation[] = [
        makeRemoveStyle("rt-rmst001", "color", "blue"),
        makePositionElement("rt-pos0001", "static", "absolute"),
        makeSetContainerLayout("rt-cont0001", "display", "flex"),
        makeSetChildSizing("rt-cont0001", "rt-chld0001", 0, "fill", "flex: 1"),
        makeGridSpan("rt-grch0001", "rt-grch0001", "column", 1, 3),
        makeBreakpointStyleEdit("rt-bpse0001", "md", "margin", "8px"),
      ];
      for (const op of ops) manager.applyOperation(op);

      expect(manager.stylesheet.ruleCount()).toBe(ops.length);
      manager.clearAll();
      expect(manager.stylesheet.ruleCount()).toBe(0);
    });
  });

  describe("DOM attribute/class/text kinds", () => {
    it("set-attribute sets and rollback restores prior absence", () => {
      const { manager, dom } = setup();
      const el = regDiv(dom, "rt-target001");

      const rollback = manager.applyOperation(makeSetAttribute("rt-target001", "aria-label", "x"));
      expect(el.getAttribute("aria-label")).toBe("x");

      rollback();
      expect(el.hasAttribute("aria-label")).toBe(false);
    });

    it("breakpoint-class-edit swaps a class", () => {
      const { manager, dom } = setup();
      const el = regDiv(dom, "rt-target001");
      el.className = "old";

      const rollback = manager.applyOperation(
        makeBreakpointClassEdit("rt-target001", "md", "old", "new"),
      );
      expect(el.classList.contains("new")).toBe(true);

      rollback();
      expect(el.classList.contains("old")).toBe(true);
    });

    it("breakpoint-text-edit replaces text", () => {
      const { manager, dom } = setup();
      const el = regDiv(dom, "rt-target001", "original");

      const rollback = manager.applyOperation(
        makeBreakpointTextEdit("rt-target001", "md", "changed"),
      );
      expect(el.textContent).toBe("changed");

      rollback();
      expect(el.textContent).toBe("original");
    });
  });

  describe("unknown kind raises a typed error", () => {
    it("throws UnsupportedPreviewOperationError for an unrecognized kind", () => {
      const { manager } = setup();
      const bogus = { kind: "does-not-exist" } as unknown as Operation;

      expect(() => manager.applyOperation(bogus)).toThrow(UnsupportedPreviewOperationError);
      try {
        manager.applyOperation({ kind: "other" } as unknown as Operation);
      } catch (err) {
        expect(err).toBeInstanceOf(UnsupportedPreviewOperationError);
        expect((err as UnsupportedPreviewOperationError).kind).toBe("other");
      }
    });
  });

  describe("R7 preview-clear-before-verify", () => {
    it("activeCount reaches 0 after clearAll so verification can assert a clean slate", () => {
      const { manager, dom } = setup();
      regDiv(dom, "rt-target001");
      regParentWithChildren(dom, "rt-parent001", ["A", "B", "C"]);

      manager.applyOperation(makeGridReorder("rt-parent001", "rt-c30001", "dom-order", 2, 0));
      manager.applyOperation(makeSetAttribute("rt-target001", "data-x", "1"));
      manager.applyOperation(makeSuggestedDiff("diff"));
      expect(manager.activeCount).toBe(3);

      manager.clearAll();

      expect(manager.activeCount).toBe(0);
      expect(manager.stylesheet.ruleCount()).toBe(0);
    });
  });
});
