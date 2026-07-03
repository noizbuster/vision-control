import { describe, expect, it } from "vitest";

import {
  type AlignmentCandidate,
  type AlignmentInput,
  resolveAlignmentCandidate,
} from "./alignment-candidates.js";

const base = (over: Partial<AlignmentInput>): AlignmentInput => ({
  parentRole: "flex-row",
  command: "align-center",
  memberCount: 3,
  ...over,
});

const asParentProperty = (
  candidate: AlignmentCandidate,
): { property: string; value: string; requiresFlexConversion: boolean } => {
  if (candidate.kind !== "parent-layout-property") {
    throw new Error(`expected parent-layout-property, got ${candidate.kind}`);
  }
  return {
    property: candidate.property,
    value: candidate.value,
    requiresFlexConversion: candidate.requiresFlexConversion,
  };
};

describe("resolveAlignmentCandidate — flex-row parent (the headline scenario)", () => {
  it("align-left -> justify-content: flex-start (main axis = horizontal)", () => {
    const c = resolveAlignmentCandidate(base({ command: "align-left" }));
    expect(c.kind).toBe("parent-layout-property");
    expect(asParentProperty(c)).toEqual({
      property: "justify-content",
      value: "flex-start",
      requiresFlexConversion: false,
    });
  });

  it("align-center -> justify-content: center", () => {
    const c = resolveAlignmentCandidate(base({ command: "align-center" }));
    expect(asParentProperty(c)).toEqual({
      property: "justify-content",
      value: "center",
      requiresFlexConversion: false,
    });
  });

  it("align-right -> justify-content: flex-end", () => {
    const c = resolveAlignmentCandidate(base({ command: "align-right" }));
    expect(asParentProperty(c).property).toBe("justify-content");
    expect(asParentProperty(c).value).toBe("flex-end");
  });

  it("align-top -> align-items: flex-start (cross axis = vertical)", () => {
    const c = resolveAlignmentCandidate(base({ command: "align-top" }));
    expect(asParentProperty(c)).toEqual({
      property: "align-items",
      value: "flex-start",
      requiresFlexConversion: false,
    });
  });

  it("align-middle -> align-items: center", () => {
    const c = resolveAlignmentCandidate(base({ command: "align-middle" }));
    expect(asParentProperty(c).property).toBe("align-items");
    expect(asParentProperty(c).value).toBe("center");
  });

  it("align-bottom -> align-items: flex-end", () => {
    const c = resolveAlignmentCandidate(base({ command: "align-bottom" }));
    expect(asParentProperty(c).property).toBe("align-items");
    expect(asParentProperty(c).value).toBe("flex-end");
  });
});

describe("resolveAlignmentCandidate — flex-column parent (axes inverted)", () => {
  it("align-top -> justify-content: flex-start (main axis = vertical)", () => {
    const c = resolveAlignmentCandidate(base({ parentRole: "flex-column", command: "align-top" }));
    expect(asParentProperty(c).property).toBe("justify-content");
    expect(asParentProperty(c).value).toBe("flex-start");
  });

  it("align-left -> align-items: flex-start (cross axis = horizontal)", () => {
    const c = resolveAlignmentCandidate(base({ parentRole: "flex-column", command: "align-left" }));
    expect(asParentProperty(c).property).toBe("align-items");
    expect(asParentProperty(c).value).toBe("flex-start");
  });
});

describe("resolveAlignmentCandidate — equal-gap produces a parent gap intent", () => {
  it("equal-gap in a flex row -> parent gap property (NOT a transform)", () => {
    const c = resolveAlignmentCandidate(base({ command: "equal-gap" }));
    expect(c.kind).toBe("parent-layout-property");
    expect(asParentProperty(c).property).toBe("gap");
    expect(asParentProperty(c).requiresFlexConversion).toBe(false);
  });

  it("equal-gap carries the caller-computed gap value when provided", () => {
    const c = resolveAlignmentCandidate(base({ command: "equal-gap", computedGap: "16px" }));
    expect(asParentProperty(c).value).toBe("16px");
  });

  it("equal-gap defaults to 'auto' when no computed gap is supplied", () => {
    const c = resolveAlignmentCandidate(base({ command: "equal-gap" }));
    expect(asParentProperty(c).value).toBe("auto");
  });
});

describe("resolveAlignmentCandidate — distribution", () => {
  it("distribute-horizontal in a flex row -> justify-content: space-between (main axis)", () => {
    const c = resolveAlignmentCandidate(base({ command: "distribute-horizontal" }));
    expect(c.kind).toBe("parent-layout-property");
    expect(asParentProperty(c).property).toBe("justify-content");
    expect(asParentProperty(c).value).toBe("space-between");
  });

  it("distribute-vertical in a flex row -> align-content: space-between (cross axis)", () => {
    const c = resolveAlignmentCandidate(base({ command: "distribute-vertical" }));
    expect(asParentProperty(c).property).toBe("align-content");
    expect(asParentProperty(c).value).toBe("space-between");
  });

  it("distribute-vertical in a flex column -> justify-content: space-between (main axis)", () => {
    const c = resolveAlignmentCandidate(
      base({ parentRole: "flex-column", command: "distribute-vertical" }),
    );
    expect(asParentProperty(c).property).toBe("justify-content");
  });
});

describe("resolveAlignmentCandidate — match-size", () => {
  it("match width in a flex row -> child flex:1 (main axis = width)", () => {
    const c = resolveAlignmentCandidate(base({ command: "match-size", matchAxis: "width" }));
    expect(c.kind).toBe("child-alignment-intent");
    if (c.kind === "child-alignment-intent") {
      expect(c.property).toBe("flex");
      expect(c.value).toBe("1");
    }
  });

  it("match height in a flex row -> parent align-items: stretch (cross axis = height)", () => {
    const c = resolveAlignmentCandidate(base({ command: "match-size", matchAxis: "height" }));
    expect(c.kind).toBe("parent-layout-property");
    expect(asParentProperty(c).property).toBe("align-items");
    expect(asParentProperty(c).value).toBe("stretch");
  });

  it("match width in a flex column -> parent align-items: stretch (cross axis = width)", () => {
    const c = resolveAlignmentCandidate(
      base({ parentRole: "flex-column", command: "match-size", matchAxis: "width" }),
    );
    expect(asParentProperty(c).property).toBe("align-items");
    expect(asParentProperty(c).value).toBe("stretch");
  });
});

describe("resolveAlignmentCandidate — non-flex normal-flow parent (block)", () => {
  it("align-center on a block parent signals a flex conversion (still a property)", () => {
    const c = resolveAlignmentCandidate(base({ parentRole: "block", command: "align-center" }));
    expect(c.kind).toBe("parent-layout-property");
    expect(asParentProperty(c).requiresFlexConversion).toBe(true);
  });

  it("equal-gap on a block parent signals a flex conversion", () => {
    const c = resolveAlignmentCandidate(base({ parentRole: "block", command: "equal-gap" }));
    expect(c.kind).toBe("parent-layout-property");
    expect(asParentProperty(c).requiresFlexConversion).toBe(true);
  });
});

describe("resolveAlignmentCandidate — positioned context (Task 6 rule)", () => {
  it("allows coordinate intent when positioned AND user opts in", () => {
    const c = resolveAlignmentCandidate(
      base({
        parentRole: "absolute",
        contextPositioned: true,
        userIntent: "free-move",
      }),
    );
    expect(c.kind).toBe("positioned-coordinate-intent");
    if (c.kind === "positioned-coordinate-intent") {
      expect(c.userIntent).toBe("free-move");
    }
  });

  it("rejects positioned alignment WITHOUT explicit opt-in", () => {
    const c = resolveAlignmentCandidate(base({ parentRole: "absolute", contextPositioned: true }));
    expect(c.kind).toBe("unsupported-normal-flow-pixel-transform");
  });
});

describe("resolveAlignmentCandidate — MISLEADING-SUCCESS guard (no pixel transforms for normal flow)", () => {
  // PRD constraint 2 / D41: a normal-flow alignment must NEVER collapse to a
  // pixel transform. Every rejected diagnostic message must avoid instructing
  // absolute positioning or translate transforms.
  const normalFlowRoles: ReadonlyArray<
    ["flex-row" | "flex-column" | "block" | "inline" | "inline-block"]
  > = [["flex-row"], ["flex-column"], ["block"], ["inline"], ["inline-block"]];

  for (const [role] of normalFlowRoles) {
    it(`never returns a pixel-transform or coordinate candidate for role ${role}`, () => {
      for (const command of [
        "align-left",
        "align-center",
        "align-right",
        "align-top",
        "align-middle",
        "align-bottom",
        "distribute-horizontal",
        "distribute-vertical",
        "equal-gap",
        "match-size",
      ] as const) {
        const c = resolveAlignmentCandidate(base({ parentRole: role, command }));
        expect(c.kind).not.toBe("positioned-coordinate-intent");
        if (c.kind === "unsupported-normal-flow-pixel-transform") {
          expect(c.message).not.toMatch(/position:\s*absolute/i);
          expect(c.message).not.toMatch(/transform:\s*translate/i);
        }
      }
    });
  }

  it("rejects an explicit free-move opt-in inside normal flow", () => {
    const c = resolveAlignmentCandidate(base({ parentRole: "flex-row", userIntent: "free-move" }));
    // Still resolves to a parent property — the opt-in is ignored for normal flow.
    expect(c.kind).toBe("parent-layout-property");
  });
});

describe("resolveAlignmentCandidate — validation", () => {
  it("rejects a grid parent with unsupported-alignment-grid", () => {
    const c = resolveAlignmentCandidate(base({ parentRole: "grid" }));
    expect(c.kind).toBe("unsupported-alignment-grid");
  });

  it("rejects fewer than two members", () => {
    const c = resolveAlignmentCandidate(base({ memberCount: 1 }));
    expect(c.kind).toBe("unsupported-normal-flow-pixel-transform");
    if (c.kind === "unsupported-normal-flow-pixel-transform") {
      expect(c.message).toMatch(/at least two/i);
    }
  });
});
