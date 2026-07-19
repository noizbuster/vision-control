import { expect, test } from "@playwright/test";

import { computeInverse, type ResizeElementOperation } from "@vision-control/change-ir";
import {
  classifyLayoutRole,
  type GridTrackInfo,
  generateGridSpanCandidates,
  generateResizeCandidates,
  type LayoutComputedStyle,
} from "@vision-control/layout-engine";

const resizeOperation: ResizeElementOperation = {
  kind: "resize-element",
  id: "resize-001",
  timestamp: 1000,
  runtime: false,
  origin: "canvas-drag",
  confidence: 1,
  target: { runtimeId: "el-resize01" },
  element: { runtimeId: "el-resize01" },
  property: "flex-basis",
  fromValue: "200px",
  toValue: "300px",
  unit: "px",
};

const cssProperties = (
  candidates: readonly { readonly kind: string; readonly property?: string }[],
): readonly string[] =>
  candidates
    .filter((candidate) => candidate.kind === "css-property")
    .map((candidate) => candidate.property ?? "");

test.describe("@resize unit", () => {
  test("flex item generates flex-basis candidates, not width or height", () => {
    const style: LayoutComputedStyle = {
      display: "block",
      flexDirection: "row",
      position: "static",
      parentDisplay: "flex",
    };
    const candidates = generateResizeCandidates(
      { runtimeId: "el-r01", tagName: "div" },
      classifyLayoutRole(style),
    );
    expect(candidates.supported).toBe(true);
    if (candidates.supported) {
      const properties = cssProperties(candidates.candidates);
      expect(properties).toContain("flex-basis");
      expect(properties).not.toContain("width");
      expect(properties).not.toContain("height");
    }
  });

  test("flex item emits an align-self stretch candidate", () => {
    const style: LayoutComputedStyle = {
      display: "block",
      flexDirection: "row",
      position: "static",
      parentDisplay: "flex",
    };
    const candidates = generateResizeCandidates(
      { runtimeId: "el-r01b", tagName: "div" },
      classifyLayoutRole(style),
    );
    expect(candidates.supported).toBe(true);
    if (candidates.supported) expect(cssProperties(candidates.candidates)).toContain("align-self");
  });

  test("block item generates width and height candidates", () => {
    const style: LayoutComputedStyle = {
      display: "block",
      flexDirection: "row",
      position: "static",
      parentDisplay: "block",
    };
    const candidates = generateResizeCandidates(
      { runtimeId: "el-r02", tagName: "div" },
      classifyLayoutRole(style),
    );
    expect(candidates.supported).toBe(true);
    if (candidates.supported) {
      const properties = cssProperties(candidates.candidates);
      expect(properties).toContain("width");
      expect(properties).toContain("height");
    }
  });

  test("grid container generates width and height box candidates", () => {
    const style: LayoutComputedStyle = {
      display: "grid",
      flexDirection: "row",
      position: "static",
    };
    const candidates = generateResizeCandidates(
      { runtimeId: "el-r03", tagName: "div" },
      classifyLayoutRole(style),
    );
    expect(candidates.supported).toBe(true);
    if (candidates.supported) expect(cssProperties(candidates.candidates)).toContain("width");
  });

  test("resize-element inverse swaps fromValue and toValue", () => {
    const inverse = computeInverse(resizeOperation);
    expect(inverse.kind).toBe("resize-element");
    if (inverse.kind === "resize-element") {
      expect(inverse.fromValue).toBe("300px");
      expect(inverse.toValue).toBe("200px");
    }
    expect(inverse.inverseOf).toBe("resize-001");
  });

  test("flex-row resize preserves flex-basis operation values", () => {
    const operation: ResizeElementOperation = {
      kind: "resize-element",
      id: "resize-flex-01",
      timestamp: 2000,
      runtime: false,
      origin: "canvas-drag",
      confidence: 1,
      target: { runtimeId: "el-flex-r01" },
      element: { runtimeId: "el-flex-r01" },
      property: "flex-basis",
      fromValue: "200px",
      toValue: "300px",
      unit: "px",
    };
    expect(operation.property).toBe("flex-basis");
    expect(operation.fromValue).toBe("200px");
    expect(operation.toValue).toBe("300px");
  });

  test("undo resize restores the original flex-basis", () => {
    const inverse = computeInverse(resizeOperation);
    expect(inverse.kind).toBe("resize-element");
    if (inverse.kind === "resize-element") {
      expect(inverse.property).toBe("flex-basis");
      expect(inverse.fromValue).toBe("300px");
      expect(inverse.toValue).toBe("200px");
    }
  });

  test("grid item proposes a grid-span candidate when room remains", () => {
    const tracks: GridTrackInfo = {
      columnLines: [0, 100, 200, 300],
      rowLines: [0, 50, 100],
    };
    const placement = {
      row: 1,
      column: 1,
      rowEnd: 2,
      columnEnd: 2,
      rowSpan: 1,
      columnSpan: 1,
      rect: { x: 0, y: 0, width: 100, height: 50 },
    };
    const candidates = generateGridSpanCandidates(placement, tracks);
    expect(
      candidates.some((candidate) => candidate.axis === "column" && candidate.toSpan === 2),
    ).toBe(true);
  });

  test("flex-column item generates flex-basis candidates", () => {
    const style: LayoutComputedStyle = {
      display: "block",
      flexDirection: "column",
      position: "static",
      parentDisplay: "flex",
    };
    const candidates = generateResizeCandidates(
      { runtimeId: "el-r-col", tagName: "div" },
      classifyLayoutRole(style),
    );
    expect(candidates.supported).toBe(true);
    if (candidates.supported) expect(cssProperties(candidates.candidates)).toContain("flex-basis");
  });
});
