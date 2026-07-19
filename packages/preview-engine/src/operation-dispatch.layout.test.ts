import type { Operation } from "@vision-control/change-ir";
import { beforeEach, describe, expect, it } from "vitest";
import {
  elementRef,
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
} from "./__fixtures__/helpers.js";
import { UnsupportedPreviewOperationError } from "./index.js";
import {
  registerDiv,
  registerParentWithChildren,
  resetDispatchTestDom,
  setupDispatchTest,
} from "./operation-dispatch.test-fixtures.js";

describe("preview-engine operation dispatch", () => {
  beforeEach(resetDispatchTestDom);

  it("dispatches the 14 V1 kinds", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, "rt-target001");
    registerParentWithChildren(dom, "rt-parent001", ["A", "B", "C"]);
    registerDiv(dom, "rt-container1", "container");

    const operations: Operation[] = [
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

    for (const operation of operations) {
      expect(() => manager.applyOperation(operation)).not.toThrow();
    }
    manager.clearAll();
  });

  it("dispatches the 8 structural kinds added in Task 6", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, "rt-target001", "target");
    registerParentWithChildren(dom, "rt-parent001", ["A", "B", "C"]);

    const operations: Operation[] = [
      makeRemoveStyle("rt-target001", "color"),
      makeSetAttribute("rt-target001", "data-x", "value"),
      makePositionElement("rt-target001", "static", "relative"),
      makeInsertElement("rt-new00001", "rt-parent001", 0, "span"),
      makeRemoveElement("rt-c20001", "rt-parent001", 1, "div"),
      makeDuplicateElement("rt-c10001", "rt-dup00001", "rt-parent001", 0, "div"),
      makeWrapElements(["rt-c10001", "rt-c20001"], "rt-wrap0001", "rt-parent001", "section"),
      makeUnwrapElement("rt-wrap0001", "rt-parent001", "section", ["rt-c10001"]),
    ];

    for (const operation of operations) {
      expect(() => manager.applyOperation(operation)).not.toThrow();
    }
    manager.clearAll();
  });

  it("throws UnsupportedPreviewOperationError for an unrecognized kind", () => {
    const { manager } = setupDispatchTest();

    expect(() =>
      Reflect.apply(manager.applyOperation, manager, [{ kind: "does-not-exist" }]),
    ).toThrow(UnsupportedPreviewOperationError);
    try {
      Reflect.apply(manager.applyOperation, manager, [{ kind: "other" }]);
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedPreviewOperationError);
      if (error instanceof UnsupportedPreviewOperationError) {
        expect(error.kind).toBe("other");
      }
    }
  });

  it("activeCount reaches 0 after clearAll so verification can assert a clean slate", () => {
    const { manager, dom } = setupDispatchTest();
    registerDiv(dom, "rt-target001");
    registerParentWithChildren(dom, "rt-parent001", ["A", "B", "C"]);

    manager.applyOperation(makeGridReorder("rt-parent001", "rt-c30001", "dom-order", 2, 0));
    manager.applyOperation(makeSetAttribute("rt-target001", "data-x", "1"));
    manager.applyOperation(makeSuggestedDiff("diff"));
    expect(manager.activeCount).toBe(3);

    manager.clearAll();

    expect(manager.activeCount).toBe(0);
    expect(manager.stylesheet.ruleCount()).toBe(0);
  });
});
