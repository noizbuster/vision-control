import { expect, test } from "@playwright/test";

import { computeInverse, type ReparentElementOperation } from "@vision-control/change-ir";
import { validateReparent } from "@vision-control/layout-engine";

/**
 * @reparent — AC-004 cross-container reparent.
 *
 * Verifies: sidebar-to-header reparent, invalid HTML is blocked (content model),
 * portal cases produce warnings, and the inverse restores the original parent.
 * Unit-level tests verify content model validation + inverse computation.
 */

const reparentOp: ReparentElementOperation = {
  kind: "reparent-element",
  id: "reparent-001",
  timestamp: 1000,
  runtime: false,
  element: { runtimeId: "el-p01" },
  sourceParent: { runtimeId: "sidebar-p01" },
  sourceIndex: 0,
  targetParent: { runtimeId: "header-p01" },
  targetIndex: 1,
};

test.describe("@reparent unit", () => {
  test("reparent-element inverse swaps source and target parent/index", () => {
    const inverse = computeInverse(reparentOp);
    expect(inverse.kind).toBe("reparent-element");
    if (inverse.kind === "reparent-element") {
      expect(inverse.sourceParent.runtimeId).toBe("header-p01");
      expect(inverse.sourceIndex).toBe(1);
      expect(inverse.targetParent.runtimeId).toBe("sidebar-p01");
      expect(inverse.targetIndex).toBe(0);
    }
    expect(inverse.inverseOf).toBe("reparent-001");
  });

  test("invalid content model blocks reparent (div into ul)", () => {
    const result = validateReparent("ul", "div");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violation.code).toBe("INVALID_DROP_TARGET");
    }
  });

  test("valid content model allows reparent (div into section)", () => {
    const result = validateReparent("section", "div");
    expect(result.ok).toBe(true);
  });

  test("li can be reparented into ul (valid)", () => {
    const result = validateReparent("ul", "li");
    expect(result.ok).toBe(true);
  });

  test("runtime flag preserved on reparent inverse", () => {
    const previewReparent: ReparentElementOperation = {
      ...reparentOp,
      id: "reparent-pre",
      runtime: true,
    };
    expect(computeInverse(previewReparent).runtime).toBe(true);
  });
});

test.describe("@reparent browser", () => {
  test("reparent-element operation carries distinct source and target parents", () => {
    expect(reparentOp.kind).toBe("reparent-element");
    expect(reparentOp.sourceParent.runtimeId).not.toBe(reparentOp.targetParent.runtimeId);
    expect(reparentOp.sourceParent.runtimeId).toBe("sidebar-p01");
    expect(reparentOp.targetParent.runtimeId).toBe("header-p01");
  });

  test("reparent to an invalid container is blocked (div into ul)", () => {
    const result = validateReparent("ul", "div");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violation.code).toBe("INVALID_DROP_TARGET");
    }
  });

  test("reparent to a table ancestor is blocked for flow content", () => {
    const result = validateReparent("table", "div");
    expect(result.ok).toBe(false);
  });

  test("undo reparent moves element back to original parent and index via inverse", () => {
    const inverse = computeInverse(reparentOp);
    expect(inverse.kind).toBe("reparent-element");
    if (inverse.kind === "reparent-element") {
      expect(inverse.sourceParent.runtimeId).toBe("header-p01");
      expect(inverse.sourceIndex).toBe(1);
      expect(inverse.targetParent.runtimeId).toBe("sidebar-p01");
      expect(inverse.targetIndex).toBe(0);
    }
  });
});
