import { describe, expect, it } from "vitest";

import { classifyGroupMove, type GroupMoveInput } from "./group-move-candidates.js";

const base = (over: Partial<GroupMoveInput>): GroupMoveInput => ({
  sameParent: false,
  sourceParentRole: "block",
  targetParentRole: "block",
  validContentModel: true,
  ...over,
});

describe("classifyGroupMove — same-parent sibling reorder (always allowed)", () => {
  it("classifies a same-parent normal-flow group drag as group-reorder", () => {
    const candidate = classifyGroupMove(
      base({ sameParent: true, sourceParentRole: "flex-row", targetParentRole: "flex-row" }),
    );
    expect(candidate.kind).toBe("group-reorder");
  });

  it("classifies a block-flow same-parent group drag as group-reorder", () => {
    const candidate = classifyGroupMove(base({ sameParent: true }));
    expect(candidate.kind).toBe("group-reorder");
  });

  it("never returns an unsupported candidate for a normal-flow same-parent drag", () => {
    const candidate = classifyGroupMove(
      base({ sameParent: true, sourceParentRole: "flex-column", targetParentRole: "flex-column" }),
    );
    expect(candidate.kind).not.toBe("unsupported-group-free-move");
    expect(candidate.kind).not.toBe("unsupported-group-grid");
  });
});

describe("classifyGroupMove — group reparent (allowed with ownership-risk warning)", () => {
  it("classifies a cross-parent normal-flow group drag as group-reparent", () => {
    const candidate = classifyGroupMove(base({ sameParent: false }));
    expect(candidate.kind).toBe("group-reparent");
  });

  it("carries no ownership warning when source-origin matches the target parent", () => {
    const candidate = classifyGroupMove(base({ sameParent: false, ownershipRisk: false }));
    if (candidate.kind === "group-reparent") {
      expect(candidate.ownershipRisk).toBe(false);
      expect(candidate.warning).toBeNull();
    } else {
      throw new Error(`expected group-reparent, got ${candidate.kind}`);
    }
  });

  it("emits an ownership-risk warning when member source-origin differs from the target parent", () => {
    const candidate = classifyGroupMove(base({ sameParent: false, ownershipRisk: true }));
    expect(candidate.kind).toBe("group-reparent");
    if (candidate.kind === "group-reparent") {
      expect(candidate.ownershipRisk).toBe(true);
      expect(candidate.warning).not.toBeNull();
      expect(candidate.warning).toMatch(/ownership/i);
    }
  });

  it("lowers confidence when the content model is invalid", () => {
    const valid = classifyGroupMove(base({ sameParent: false, validContentModel: true }));
    const invalid = classifyGroupMove(base({ sameParent: false, validContentModel: false }));
    if (valid.kind === "group-reparent" && invalid.kind === "group-reparent") {
      expect(valid.confidence).toBeGreaterThan(invalid.confidence);
      expect(invalid.validContentModel).toBe(false);
    }
  });
});

describe("classifyGroupMove — positioned-context group free-move (opt-in only)", () => {
  it("allows free-move when context is positioned AND user explicitly opts in", () => {
    const candidate = classifyGroupMove(
      base({
        sourceParentRole: "absolute",
        targetParentRole: "absolute",
        sourceContextPositioned: true,
        targetContextPositioned: true,
        userIntent: "free-move",
      }),
    );
    expect(candidate.kind).toBe("positioned-free-move");
    if (candidate.kind === "positioned-free-move") {
      expect(candidate.userIntent).toBe("free-move");
    }
  });

  it("allows free-move for a fixed-position context with explicit opt-in", () => {
    const candidate = classifyGroupMove(
      base({
        sourceParentRole: "fixed",
        targetParentRole: "fixed",
        sourceContextPositioned: true,
        targetContextPositioned: true,
        userIntent: "free-move",
      }),
    );
    expect(candidate.kind).toBe("positioned-free-move");
  });

  it("rejects positioned-context free-move WITHOUT explicit user intent", () => {
    const candidate = classifyGroupMove(
      base({
        sourceParentRole: "absolute",
        targetParentRole: "absolute",
        sourceContextPositioned: true,
        targetContextPositioned: true,
      }),
    );
    expect(candidate.kind).toBe("unsupported-group-free-move");
  });
});

describe("classifyGroupMove — normal-flow group free-move is REJECTED (PRD constraint 2 / D41)", () => {
  // misleading_success_output: a normal-flow free-move attempt must NOT silently
  // collapse to absolute positioning. It is rejected with a diagnostic.
  it("rejects a free-move attempt in a normal-flow flex context", () => {
    const candidate = classifyGroupMove(
      base({
        sameParent: true,
        sourceParentRole: "flex-row",
        targetParentRole: "flex-row",
        userIntent: "free-move",
      }),
    );
    expect(candidate.kind).toBe("unsupported-group-free-move");
    if (candidate.kind === "unsupported-group-free-move") {
      expect(candidate.message).not.toMatch(/position:\s*absolute/i);
    }
  });

  it("rejects a free-move attempt in a normal-flow block context", () => {
    const candidate = classifyGroupMove(
      base({
        sourceParentRole: "block",
        targetParentRole: "block",
        userIntent: "free-move",
      }),
    );
    expect(candidate.kind).toBe("unsupported-group-free-move");
  });

  it("rejects a free-move attempt when only one side is positioned (ambiguous)", () => {
    const candidate = classifyGroupMove(
      base({
        sourceParentRole: "absolute",
        targetParentRole: "block",
        sourceContextPositioned: true,
        targetContextPositioned: false,
        userIntent: "free-move",
      }),
    );
    expect(candidate.kind).toBe("unsupported-group-free-move");
  });
});

describe("classifyGroupMove — grid context", () => {
  it("returns unsupported-group-grid when either parent is a grid", () => {
    const source = classifyGroupMove(base({ sourceParentRole: "grid" }));
    const target = classifyGroupMove(base({ targetParentRole: "grid" }));
    expect(source.kind).toBe("unsupported-group-grid");
    expect(target.kind).toBe("unsupported-group-grid");
  });
});
