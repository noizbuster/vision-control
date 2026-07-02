import type { ElementRef } from "@vision-control/element-identity";

import { describe, expect, it } from "vitest";

import { generateResizeCandidates, type LayoutComputedStyle } from "./index.js";

const target: ElementRef = { runtimeId: "el-1", tagName: "div" };

const style = (over: Partial<LayoutComputedStyle>): LayoutComputedStyle => ({
  display: "block",
  flexDirection: "",
  position: "static",
  ...over,
});

const properties = (set: {
  supported: true;
  candidates: readonly { property: string }[];
}): readonly string[] => set.candidates.map((c) => c.property);

describe("resize candidates", () => {
  it("generates flex-basis and flex-grow for flex items (NOT width/height)", () => {
    // A block child of a flex container is a flex item.
    const set = generateResizeCandidates(target, "block", style({ parentDisplay: "flex" }));
    expect(set.supported).toBe(true);
    if (set.supported) {
      const props = properties(set);
      expect(props).toContain("flex-basis");
      expect(props).toContain("flex-grow");
      expect(props).not.toContain("width");
      expect(props).not.toContain("height");
    }
  });

  it("generates width and height for block elements", () => {
    const set = generateResizeCandidates(target, "block", style({}));
    expect(set.supported).toBe(true);
    if (set.supported) {
      const props = properties(set);
      expect(props).toContain("width");
      expect(props).toContain("height");
      expect(props).toContain("aspect-ratio");
    }
  });

  it("generates width and height for absolute/fixed/sticky elements", () => {
    for (const role of ["absolute", "fixed", "sticky"] as const) {
      const set = generateResizeCandidates(target, role, style({ position: role }));
      expect(set.supported).toBe(true);
      if (set.supported) {
        expect(properties(set)).toContain("width");
      }
    }
  });

  it("returns unsupported for grid (no grid span editing in MVP)", () => {
    const set = generateResizeCandidates(target, "grid", style({ display: "grid" }));
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("grid-unsupported");
      expect(set.target).toEqual(target);
    }
  });

  it("returns unsupported for inline elements", () => {
    const set = generateResizeCandidates(target, "inline", style({ display: "inline" }));
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("inline-unsupported");
    }
  });

  it("returns unsupported for inline-block elements", () => {
    const set = generateResizeCandidates(
      target,
      "inline-block",
      style({ display: "inline-block" }),
    );
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("inline-unsupported");
    }
  });

  it("returns unsupported for unknown roles", () => {
    const set = generateResizeCandidates(target, "unknown", style({}));
    expect(set.supported).toBe(false);
    if (!set.supported) {
      expect(set.diagnostic).toBe("unknown-unsupported");
    }
  });
});
