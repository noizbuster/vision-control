import type { ElementRef } from "@vision-control/element-identity";

import { describe, expect, it } from "vitest";

import type { GridCellPlacement, GridTrackInfo } from "./grid/grid-cell-inference.js";
import { generateResizeCandidates, type ResizeCandidate } from "./index.js";

const target: ElementRef = { runtimeId: "el-1", tagName: "div" };

const cssProperties = (candidates: readonly ResizeCandidate[]): readonly string[] =>
  candidates
    .filter(
      (c): c is Extract<ResizeCandidate, { kind: "css-property" }> => c.kind === "css-property",
    )
    .map((c) => c.property);

const kinds = (candidates: readonly ResizeCandidate[]): readonly string[] =>
  candidates.map((c) => c.kind);

const TRACKS_3x2: GridTrackInfo = {
  columnLines: [0, 100, 200, 300],
  rowLines: [0, 50, 100],
};

const gridPlacement: GridCellPlacement = {
  row: 1,
  column: 1,
  rowEnd: 2,
  columnEnd: 2,
  rowSpan: 1,
  columnSpan: 1,
  rect: { x: 0, y: 0, width: 100, height: 50 },
};

describe("resize candidates — flex-item", () => {
  it("generates flex-basis and flex-grow (NOT width/height)", () => {
    const set = generateResizeCandidates(target, "flex-item");
    expect(set.supported).toBe(true);
    if (set.supported) {
      const props = cssProperties(set.candidates);
      expect(props).toContain("flex-basis");
      expect(props).toContain("flex-grow");
      expect(props).not.toContain("width");
      expect(props).not.toContain("height");
    }
  });

  it("generates align-self stretch for the flex cross-axis (PRD 9.5)", () => {
    const set = generateResizeCandidates(target, "flex-item");
    expect(set.supported).toBe(true);
    if (set.supported) {
      expect(cssProperties(set.candidates)).toContain("align-self");
    }
  });

  it("emits tailwind-class and design-token alternative kinds", () => {
    const set = generateResizeCandidates(target, "flex-item");
    expect(set.supported).toBe(true);
    if (set.supported) {
      const ks = kinds(set.candidates);
      expect(ks).toContain("tailwind-class");
      expect(ks).toContain("design-token");
    }
  });
});

describe("resize candidates — grid-item (grid span)", () => {
  it("generates grid-span candidates when gridContext is supplied", () => {
    const set = generateResizeCandidates(target, "grid-item", {
      placement: gridPlacement,
      tracks: TRACKS_3x2,
    });
    expect(set.supported).toBe(true);
    if (set.supported) {
      const spans = set.candidates.filter(
        (c): c is Extract<ResizeCandidate, { kind: "grid-span" }> => c.kind === "grid-span",
      );
      expect(spans.length).toBeGreaterThan(0);
      const grow = spans.find((c) => c.toSpan > c.fromSpan);
      expect(grow).toBeDefined();
      if (grow !== undefined) {
        expect(grow.axis).toBe("column");
        expect(grow.fromSpan).toBe(1);
        expect(grow.toSpan).toBe(2);
      }
    }
  });

  it("emits NO grid-unsupported diagnostic (regression guard)", () => {
    const set = generateResizeCandidates(target, "grid-item", {
      placement: gridPlacement,
      tracks: TRACKS_3x2,
    });
    expect(set.supported).toBe(true);
  });

  it("returns supported with empty candidates when gridContext is absent", () => {
    const set = generateResizeCandidates(target, "grid-item");
    expect(set.supported).toBe(true);
    if (set.supported) {
      expect(set.candidates).toEqual([]);
    }
  });
});

describe("resize candidates — grid-container (box, no longer unsupported)", () => {
  it("generates width/height box candidates", () => {
    const set = generateResizeCandidates(target, "grid-container");
    expect(set.supported).toBe(true);
    if (set.supported) {
      expect(cssProperties(set.candidates)).toContain("width");
    }
  });
});

describe("resize candidates — box roles", () => {
  it("generates width, height, and aspect-ratio for normal-flow-block", () => {
    const set = generateResizeCandidates(target, "normal-flow-block");
    expect(set.supported).toBe(true);
    if (set.supported) {
      const props = cssProperties(set.candidates);
      expect(props).toContain("width");
      expect(props).toContain("height");
      expect(props).toContain("aspect-ratio");
    }
  });

  it("generates width for absolute-positioned and fixed-positioned", () => {
    for (const role of ["absolute-positioned", "fixed-positioned"] as const) {
      const set = generateResizeCandidates(target, role);
      expect(set.supported).toBe(true);
      if (set.supported) {
        expect(cssProperties(set.candidates)).toContain("width");
      }
    }
  });

  it("generates width for svg-element and flex-container", () => {
    for (const role of ["svg-element", "flex-container"] as const) {
      const set = generateResizeCandidates(target, role);
      expect(set.supported).toBe(true);
      if (set.supported) {
        expect(cssProperties(set.candidates)).toContain("width");
      }
    }
  });
});

describe("resize candidates — replaced-element (intrinsic)", () => {
  it("emits an intrinsic sizing candidate plus box candidates", () => {
    const set = generateResizeCandidates(target, "replaced-element");
    expect(set.supported).toBe(true);
    if (set.supported) {
      expect(kinds(set.candidates)).toContain("intrinsic");
      const props = cssProperties(set.candidates);
      expect(props).toContain("width");
      expect(props).toContain("aspect-ratio");
    }
  });
});

describe("resize candidates — unsupported roles", () => {
  it("returns inline-unsupported for inline", () => {
    const set = generateResizeCandidates(target, "inline");
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("inline-unsupported");
      expect(set.target).toEqual(target);
    }
  });

  it("returns inline-unsupported for inline-block", () => {
    const set = generateResizeCandidates(target, "inline-block");
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("inline-unsupported");
    }
  });

  it("returns unknown-unsupported for unknown", () => {
    const set = generateResizeCandidates(target, "unknown");
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("unknown-unsupported");
    }
  });
});

describe("resize candidates — 12 PRD section 9.5 kinds coverage", () => {
  it("every kind is emitted across the role matrix", () => {
    const seenKinds = new Set<string>();
    const roles = ["flex-item", "grid-item", "replaced-element", "normal-flow-block"] as const;
    for (const role of roles) {
      const set = generateResizeCandidates(target, role, {
        placement: gridPlacement,
        tracks: TRACKS_3x2,
      });
      if (set.supported) {
        for (const c of set.candidates) seenKinds.add(c.kind);
      }
    }
    for (const kind of [
      "css-property",
      "grid-span",
      "intrinsic",
      "tailwind-class",
      "design-token",
    ]) {
      expect(seenKinds.has(kind)).toBe(true);
    }
  });
});
