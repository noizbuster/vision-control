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
  test.fixme("sidebar button reparents to header", async ({ page }) => {
    // Given: the Reparent fixture is loaded (sidebar + header layout).
    // When: the user drags a button from the sidebar into the header.
    // Then: a reparent-element operation is committed with correct
    //       sourceParent/targetParent identities and indices.
    // Assert: operation.sourceParent.runtimeId !== operation.targetParent.runtimeId.
  });

  test.fixme("invalid HTML reparent is blocked with diagnostic", async ({ page }) => {
    // Given: the user drags a <div> toward a <ul> drop target.
    // When: the drop is attempted.
    // Then: validateReparent returns INVALID_DROP_TARGET.
    // Assert: no reparent-element operation is committed; a diagnostic is shown.
  });

  test.fixme("portal reparent produces a structural-preview warning", async ({ page }) => {
    // Given: a React portal case where the DOM parent differs from the React tree parent.
    // When: a reparent is attempted.
    // Then: a STRUCTURAL_PREVIEW_RECONCILED warning is emitted because React
    //       reconciliation may revert the DOM move.
    // Assert: the warning appears in the operation's diagnostics list.
  });

  test.fixme("undo reparent restores element to original parent and index", async ({ page }) => {
    // Given: a reparent-element operation has been committed (element moved
    //        from sidebar index 0 to header index 1).
    // When: the user undoes.
    // Then: the inverse moves the element back to sidebar at index 0.
    // Assert: the element's parent node is the sidebar; its index is 0.
  });
});
