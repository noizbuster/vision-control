import { expect, test } from "@playwright/test";

import { classifySemanticIntent } from "@vision-control/layout-engine";

/**
 * Risk gate D.2: normal-flow drag never collapses to position:absolute.
 *
 * PRD Appendix D.2 (MUST NOT): a normal-flow drag MUST NOT default to an
 * absolute-positioning source intent. The layout engine's
 * `classifySemanticIntent` returns `reorder-child` or `reparent-element` for
 * in-flow drags and only ever returns `unsupported-free-move` as a diagnostic
 * for an already-positioned context — never as an instruction to set absolute.
 *
 * This is a pure-function test; no browser needed.
 */

test.describe("risk: drag semantic collapse (unit)", () => {
  test("same-parent in-flow drag classifies as reorder-child", () => {
    const result = classifySemanticIntent({
      sameParent: true,
      sourceParentRole: "flex-column",
      targetParentRole: "flex-column",
      validContentModel: true,
    });
    expect(result.kind).toBe("reorder-child");
  });

  test("cross-parent in-flow drag classifies as reparent-element", () => {
    const result = classifySemanticIntent({
      sameParent: false,
      sourceParentRole: "block",
      targetParentRole: "block",
      validContentModel: true,
    });
    expect(result.kind).toBe("reparent-element");
    if (result.kind === "reparent-element") {
      expect(result.validContentModel).toBe(true);
    }
  });

  test("in-flow drag NEVER returns unsupported-free-move", () => {
    const result = classifySemanticIntent({
      sameParent: true,
      sourceParentRole: "flex-row",
      targetParentRole: "flex-row",
      validContentModel: true,
    });
    expect(result.kind).not.toBe("unsupported-free-move");
  });

  test("positioned context returns unsupported-free-move (diagnostic, not absolute)", () => {
    const result = classifySemanticIntent({
      sameParent: false,
      sourceParentRole: "absolute",
      targetParentRole: "block",
      validContentModel: true,
      targetContextPositioned: true,
    });
    expect(result.kind).toBe("unsupported-free-move");
    if (result.kind === "unsupported-free-move") {
      // The message must NEVER instruct setting position: absolute.
      expect(result.message).not.toContain("position: absolute");
      expect(result.message).not.toContain("position:absolute");
    }
  });

  test("grid context returns unsupported-grid", () => {
    const result = classifySemanticIntent({
      sameParent: true,
      sourceParentRole: "grid",
      targetParentRole: "grid",
      validContentModel: true,
    });
    expect(result.kind).toBe("unsupported-grid");
  });

  test("block-flow drag is reorder-child (not absolute)", () => {
    const result = classifySemanticIntent({
      sameParent: true,
      sourceParentRole: "block",
      targetParentRole: "block",
      validContentModel: true,
    });
    expect(result.kind).toBe("reorder-child");
  });

  test("invalid content model lowers reparent confidence but still not absolute", () => {
    const result = classifySemanticIntent({
      sameParent: false,
      sourceParentRole: "block",
      targetParentRole: "block",
      validContentModel: false,
    });
    expect(result.kind).toBe("reparent-element");
    if (result.kind === "reparent-element") {
      expect(result.validContentModel).toBe(false);
    }
  });
});
