import { expect, test } from "@playwright/test";

import { computeInverse, type ResizeElementOperation } from "@vision-control/change-ir";
import {
  classifyLayoutRole,
  generateResizeCandidates,
  type LayoutComputedStyle,
} from "@vision-control/layout-engine";

/**
 * @resize — AC-005 element resize.
 *
 * Verifies: resize handle visibility, smooth drag preview, flex-basis candidate
 * generation for flex items (not width/height), align-self stretch for the flex
 * cross-axis, grid-span candidates for grid items, inverse restore. Unit tests
 * verify candidate generation + inverse.
 */

const resizeOp: ResizeElementOperation = {
  kind: "resize-element",
  id: "resize-001",
  timestamp: 1000,
  runtime: false,
  target: { runtimeId: "el-resize01" },
  property: "flex-basis",
  fromValue: "200px",
  toValue: "300px",
};

const cssProperties = (candidates: readonly { readonly kind: string; readonly property?: string }[]): readonly string[] =>
  candidates.filter((c) => c.kind === "css-property").map((c) => c.property ?? "");

test.describe("@resize unit", () => {
  test("flex item generates flex-basis candidates, not width/height", () => {
    const style: LayoutComputedStyle = {
      display: "block",
      flexDirection: "row",
      position: "static",
      parentDisplay: "flex",
    };
    const candidates = generateResizeCandidates(
      { runtimeId: "el-r01" },
      classifyLayoutRole(style),
    );
    expect(candidates.supported).toBe(true);
    if (candidates.supported) {
      const props = cssProperties(candidates.candidates);
      expect(props).toContain("flex-basis");
      expect(props).not.toContain("width");
      expect(props).not.toContain("height");
    }
  });

  test("flex item emits an align-self stretch candidate (cross-axis)", () => {
    const style: LayoutComputedStyle = {
      display: "block",
      flexDirection: "row",
      position: "static",
      parentDisplay: "flex",
    };
    const candidates = generateResizeCandidates(
      { runtimeId: "el-r01b" },
      classifyLayoutRole(style),
    );
    expect(candidates.supported).toBe(true);
    if (candidates.supported) {
      expect(cssProperties(candidates.candidates)).toContain("align-self");
    }
  });

  test("block item generates width/height candidates", () => {
    const style: LayoutComputedStyle = {
      display: "block",
      flexDirection: "row",
      position: "static",
      parentDisplay: "block",
    };
    const candidates = generateResizeCandidates(
      { runtimeId: "el-r02" },
      classifyLayoutRole(style),
    );
    expect(candidates.supported).toBe(true);
    if (candidates.supported) {
      const props = cssProperties(candidates.candidates);
      expect(props).toContain("width");
      expect(props).toContain("height");
    }
  });

  test("grid container generates width/height box candidates (no longer unsupported)", () => {
    const style: LayoutComputedStyle = {
      display: "grid",
      flexDirection: "row",
      position: "static",
    };
    const candidates = generateResizeCandidates(
      { runtimeId: "el-r03" },
      classifyLayoutRole(style),
    );
    expect(candidates.supported).toBe(true);
    if (candidates.supported) {
      expect(cssProperties(candidates.candidates)).toContain("width");
    }
  });

  test("resize-element inverse swaps fromValue and toValue", () => {
    const inverse = computeInverse(resizeOp);
    expect(inverse.kind).toBe("resize-element");
    if (inverse.kind === "resize-element") {
      expect(inverse.fromValue).toBe("300px");
      expect(inverse.toValue).toBe("200px");
    }
    expect(inverse.inverseOf).toBe("resize-001");
  });
});

test.describe("@resize browser", () => {
  test.fixme("resize handles appear when a resizable element is selected", async ({ page }) => {
    // Given: a flex item is selected.
    // When: the selection overlay renders.
    // Then: resize handles appear at the element's edges (sides for flex-row,
    //       top/bottom for flex-column).
    // Assert: handle elements are visible with correct positioning.
  });

  test.fixme("dragging a handle produces a smooth preview", async ({ page }) => {
    // Given: a resize handle is grabbed and dragging.
    // When: the pointer moves 50px outward.
    // Then: the element's preview updates in real-time (ghost or inline style).
    // Assert: preview width/basis increases by ~50px from the start value.
  });

  test.fixme("pointerup generates a flex-basis resize operation", async ({ page }) => {
    // Given: a flex-row item resize drag completes.
    // When: pointerup fires.
    // Then: the committed operation has property "flex-basis" (not "width").
    // Assert: fromValue and toValue reflect the before/after sizes.
  });

  test.fixme("undo resize restores original size", async ({ page }) => {
    // Given: a resize-element operation changed flex-basis from 200px to 300px.
    // When: the user undoes.
    // Then: the inverse changes flex-basis from 300px back to 200px.
    // Assert: element computed flex-basis is "200px".
  });

  test.fixme("grid item resize proposes a grid-span candidate", async ({ page }) => {
    // Given: an element inside a CSS Grid container is selected.
    // When: the user grabs a resize handle.
    // Then: a grid-column / grid-row span candidate is generated (PRD 9.5).
    // Assert: the selected candidate carries kind "grid-span" with axis + spans.
  });
});
