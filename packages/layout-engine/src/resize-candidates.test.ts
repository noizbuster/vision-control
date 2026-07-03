import type { ElementRef } from "@vision-control/element-identity";

import { describe, expect, it } from "vitest";

import { generateResizeCandidates } from "./index.js";

const target: ElementRef = { runtimeId: "el-1", tagName: "div" };

const properties = (set: {
  supported: true;
  candidates: readonly { property: string }[];
}): readonly string[] => set.candidates.map((c) => c.property);

describe("resize candidates", () => {
  it("generates flex-basis and flex-grow for flex-items (NOT width/height)", () => {
    const set = generateResizeCandidates(target, "flex-item");
    expect(set.supported).toBe(true);
    if (set.supported) {
      const props = properties(set);
      expect(props).toContain("flex-basis");
      expect(props).toContain("flex-grow");
      expect(props).not.toContain("width");
      expect(props).not.toContain("height");
    }
  });

  it("generates width and height for normal-flow-block elements", () => {
    const set = generateResizeCandidates(target, "normal-flow-block");
    expect(set.supported).toBe(true);
    if (set.supported) {
      const props = properties(set);
      expect(props).toContain("width");
      expect(props).toContain("height");
      expect(props).toContain("aspect-ratio");
    }
  });

  it("generates width and height for absolute-positioned and fixed-positioned elements", () => {
    for (const role of ["absolute-positioned", "fixed-positioned"] as const) {
      const set = generateResizeCandidates(target, role);
      expect(set.supported).toBe(true);
      if (set.supported) {
        expect(properties(set)).toContain("width");
      }
    }
  });

  it("generates box candidates for replaced-element (intrinsic sizing)", () => {
    const set = generateResizeCandidates(target, "replaced-element");
    expect(set.supported).toBe(true);
    if (set.supported) {
      const props = properties(set);
      expect(props).toContain("width");
      expect(props).toContain("aspect-ratio");
    }
  });

  it("generates box candidates for svg-element", () => {
    const set = generateResizeCandidates(target, "svg-element");
    expect(set.supported).toBe(true);
    if (set.supported) {
      expect(properties(set)).toContain("width");
    }
  });

  it("generates box candidates for flex-container", () => {
    const set = generateResizeCandidates(target, "flex-container");
    expect(set.supported).toBe(true);
    if (set.supported) {
      expect(properties(set)).toContain("width");
    }
  });

  it("returns unsupported for grid-container (no grid span editing in MVP)", () => {
    const set = generateResizeCandidates(target, "grid-container");
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("grid-unsupported");
      expect(set.target).toEqual(target);
    }
  });

  it("returns unsupported for grid-item", () => {
    const set = generateResizeCandidates(target, "grid-item");
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("grid-unsupported");
    }
  });

  it("returns unsupported for inline elements", () => {
    const set = generateResizeCandidates(target, "inline");
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("inline-unsupported");
    }
  });

  it("returns unsupported for inline-block elements", () => {
    const set = generateResizeCandidates(target, "inline-block");
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("inline-unsupported");
    }
  });

  it("returns unsupported for unknown roles", () => {
    const set = generateResizeCandidates(target, "unknown");
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("unknown-unsupported");
    }
  });
});
