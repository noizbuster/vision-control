import type {
  ElementRef,
  MultiSelectFrameKind,
  MultiSelectMember,
} from "@vision-control/element-identity";
import { createMultiSelectGroupId } from "@vision-control/element-identity";
import { describe, expect, it } from "vitest";

import {
  type ConstraintViolation,
  computeBoundingRect,
  computeCommonParent,
  createMultiSelectGroup,
  evaluateGroupConstraints,
} from "./multi-select-model.js";

const member = (
  runtimeId: string,
  additions: Partial<Omit<MultiSelectMember, "runtimeId">> = {},
): MultiSelectMember => ({
  runtimeId,
  tagName: "div",
  frameId: "main",
  frameKind: "top",
  shadowKind: "light-dom",
  ...additions,
});

const ref = (runtimeId: string, tagName = "div"): ElementRef => ({ runtimeId, tagName });

describe("group-constraints: frame compatibility", () => {
  it("accepts two members in the same top frame", () => {
    const result = evaluateGroupConstraints([
      member("r1", { frameId: "main", frameKind: "top" }),
      member("r2", { frameId: "main", frameKind: "top" }),
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects members spanning different frames (cross-frame)", () => {
    const result = evaluateGroupConstraints([
      member("r1", { frameId: "main", frameKind: "top" }),
      member("r2", { frameId: "frame-2", frameKind: "same-origin-iframe" }),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.code === "cross-frame")).toBe(true);
    }
  });

  it("rejects fewer than 2 members (too-few-members)", () => {
    const result = evaluateGroupConstraints([member("r1")]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.code === "too-few-members")).toBe(true);
    }
  });

  it("rejects zero members (too-few-members)", () => {
    const result = evaluateGroupConstraints([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.code === "too-few-members")).toBe(true);
    }
  });
});

describe("group-constraints: shadow compatibility", () => {
  it("accepts two members both in light DOM", () => {
    const result = evaluateGroupConstraints([
      member("r1", { shadowKind: "light-dom" }),
      member("r2", { shadowKind: "light-dom" }),
    ]);
    expect(result.ok).toBe(true);
  });

  it("accepts two members both in the same open shadow root", () => {
    const result = evaluateGroupConstraints([
      member("r1", { shadowKind: "open-shadow-root" }),
      member("r2", { shadowKind: "open-shadow-root" }),
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects mixing light DOM and an open shadow root", () => {
    const result = evaluateGroupConstraints([
      member("r1", { shadowKind: "light-dom" }),
      member("r2", { shadowKind: "open-shadow-root" }),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.code === "incompatible-shadow")).toBe(true);
    }
  });
});

describe("group-constraints: duplicate member detection", () => {
  it("rejects two members sharing a runtime id (duplicate-member)", () => {
    const result = evaluateGroupConstraints([member("r-same"), member("r-same")]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.some((v) => v.code === "duplicate-member")).toBe(true);
    }
  });
});

describe("bounding-rect math", () => {
  it("returns null for an empty list", () => {
    expect(computeBoundingRect([])).toBeNull();
  });

  it("returns the single rect when given one", () => {
    const r = { x: 10, y: 20, width: 30, height: 40 };
    expect(computeBoundingRect([r])).toEqual(r);
  });

  it("computes the bounding box of disjoint rects", () => {
    const box = computeBoundingRect([
      { x: 10, y: 10, width: 20, height: 20 },
      { x: 50, y: 60, width: 30, height: 40 },
    ]);
    // min(10,50)=50? no: min x=10, min y=10, max right=80, max bottom=100
    expect(box).toEqual({ x: 10, y: 10, width: 70, height: 90 });
  });

  it("handles negative coordinates", () => {
    const box = computeBoundingRect([
      { x: -20, y: -10, width: 10, height: 5 },
      { x: 0, y: 0, width: 5, height: 10 },
    ]);
    expect(box).toEqual({ x: -20, y: -10, width: 25, height: 20 });
  });
});

describe("computeCommonParent (lowest common ancestor)", () => {
  const parentChains = (
    ...chains: readonly (readonly string[])[]
  ): readonly (readonly ElementRef[])[] => chains.map((chain) => chain.map((tag) => ref(tag, tag)));

  it("returns the deepest shared ancestor", () => {
    // chain A: html > body > main > card
    // chain B: html > body > main > aside
    // common: html > body > main
    const chains = parentChains(
      ["html", "body", "main", "card"],
      ["html", "body", "main", "aside"],
    );
    const common = computeCommonParent(chains);
    expect(common).not.toBeNull();
    expect(common?.tagName).toBe("main");
  });

  it("returns null when there is no shared ancestor", () => {
    const chains = parentChains(["rootA", "a"], ["rootB", "b"]);
    expect(computeCommonParent(chains)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(computeCommonParent([])).toBeNull();
  });
});

describe("createMultiSelectGroup (the canonical builder)", () => {
  it("builds a group from two valid same-frame members", () => {
    const result = createMultiSelectGroup({
      id: createMultiSelectGroupId("grp-0001"),
      members: [member("r1", { frameId: "main" }), member("r2", { frameId: "main" })],
      memberRects: [
        { x: 0, y: 0, width: 100, height: 50 },
        { x: 120, y: 0, width: 100, height: 50 },
      ],
      parentChains: [
        [ref("html"), ref("body"), ref("main"), ref("card", "div")],
        [ref("html"), ref("body"), ref("main"), ref("card2", "div")],
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const group = result.group;
      expect(group.id).toBe("grp-0001");
      expect(group.members).toHaveLength(2);
      expect(group.frameId).toBe("main");
      expect(group.shadowRootCompatible).toBe(true);
      expect(group.commonParent?.runtimeId).toBe("main");
      // bounding box of the two rects: x=0,y=0,w=220,h=50
      expect(group.boundingRect).toEqual({ x: 0, y: 0, width: 220, height: 50 });
    }
  });

  it("rejects cross-frame members with a diagnostic (adversarial: malformed input)", () => {
    const result = createMultiSelectGroup({
      id: createMultiSelectGroupId("grp-0002"),
      members: [
        member("r1", { frameId: "main", frameKind: "top" }),
        member("r2", {
          frameId: "frame-2",
          frameKind: "same-origin-iframe" as MultiSelectFrameKind,
        }),
      ],
      memberRects: [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 0, y: 0, width: 10, height: 10 },
      ],
      parentChains: [[ref("html")], [ref("html")]],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.length).toBeGreaterThan(0);
      const codes = result.violations.map((v) => v.code);
      expect(codes).toContain("cross-frame");
    }
  });

  it("rejects incompatible shadow roots with a diagnostic", () => {
    const result = createMultiSelectGroup({
      id: createMultiSelectGroupId("grp-0003"),
      members: [
        member("r1", { shadowKind: "light-dom" }),
        member("r2", { shadowKind: "open-shadow-root" }),
      ],
      memberRects: [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 0, y: 0, width: 10, height: 10 },
      ],
      parentChains: [[ref("host")], [ref("host")]],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations.map((v) => v.code)).toContain("incompatible-shadow");
    }
  });

  it("preserves member order in the group", () => {
    const result = createMultiSelectGroup({
      id: createMultiSelectGroupId("grp-0004"),
      members: [member("c"), member("a"), member("b")],
      memberRects: [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 0, width: 10, height: 10 },
        { x: 40, y: 0, width: 10, height: 10 },
      ],
      parentChains: [[ref("p")], [ref("p")], [ref("p")]],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.group.members.map((m) => m.runtimeId)).toEqual(["c", "a", "b"]);
    }
  });

  it("is immutable: mutating an input member after construction does not affect the group (stale_state)", () => {
    const m1 = member("r1");
    const result = createMultiSelectGroup({
      id: createMultiSelectGroupId("grp-0005"),
      members: [m1, member("r2")],
      memberRects: [
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 0, width: 10, height: 10 },
      ],
      parentChains: [[ref("p")], [ref("p")]],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Mutate the external object that was passed in.
      (m1 as { runtimeId: string }).runtimeId = "tampered";
      // The group captured its own snapshot.
      expect(result.group.members[0]?.runtimeId).toBe("r1");
    }
  });
});

describe("ConstraintViolation shape", () => {
  it("every violation carries a stable code and a human-readable message", () => {
    const v: ConstraintViolation = {
      code: "cross-frame",
      message: "members span multiple frames",
    };
    expect(typeof v.code).toBe("string");
    expect(typeof v.message).toBe("string");
  });
});
