import { describe, expect, it } from "vitest";

import { classifySemanticIntent, type SemanticInput } from "./index.js";

const base = (over: Partial<SemanticInput>): SemanticInput => ({
  sameParent: false,
  sourceParentRole: "normal-flow-block",
  targetParentRole: "normal-flow-block",
  validContentModel: true,
  ...over,
});

describe("classifySemanticIntent", () => {
  it("classifies a same-parent normal-flow drag as reorder-child", () => {
    const intent = classifySemanticIntent(base({ sameParent: true }));
    expect(intent.kind).toBe("reorder-child");
  });

  it("classifies a cross-parent normal-flow drag as reparent-element", () => {
    const intent = classifySemanticIntent(base({ sameParent: false }));
    expect(intent.kind).toBe("reparent-element");
  });

  it("LOW confidence when the content model is invalid", () => {
    const valid = classifySemanticIntent(base({ validContentModel: true }));
    const invalid = classifySemanticIntent(base({ validContentModel: false }));
    expect(valid.kind).toBe("reparent-element");
    expect(invalid.kind).toBe("reparent-element");
    if (valid.kind === "reparent-element" && invalid.kind === "reparent-element") {
      expect(valid.confidence).toBeGreaterThan(invalid.confidence);
      expect(invalid.validContentModel).toBe(false);
    }
  });

  it("returns unsupported-grid for a grid-container context", () => {
    const intent = classifySemanticIntent(base({ targetParentRole: "grid-container" }));
    expect(intent.kind).toBe("unsupported-grid");
  });

  // PRD constraint 2 (MUST NOT): a normal-flow drag MUST NOT collapse to a
  // position:absolute source intent. It returns reorder/reparent, never an
  // absolute-positioning instruction. unsupported-free-move is only ever a
  // DIAGNOSTIC for an already-positioned context.
  it("NEVER returns unsupported-free-move for a normal-flow drag", () => {
    const same = classifySemanticIntent(
      base({
        sameParent: true,
        sourceParentRole: "normal-flow-block",
        targetParentRole: "normal-flow-block",
      }),
    );
    const cross = classifySemanticIntent(
      base({
        sameParent: false,
        sourceParentRole: "flex-container",
        targetParentRole: "flex-container",
      }),
    );
    expect(same.kind).not.toBe("unsupported-free-move");
    expect(cross.kind).not.toBe("unsupported-free-move");
    expect(["reorder-child", "reparent-element"]).toContain(same.kind);
    expect(["reorder-child", "reparent-element"]).toContain(cross.kind);
  });

  it("returns unsupported-free-move ONLY for an already-positioned context (diagnostic, not absolute intent)", () => {
    const intent = classifySemanticIntent(base({ targetContextPositioned: true }));
    expect(intent.kind).toBe("unsupported-free-move");
    if (intent.kind === "unsupported-free-move") {
      expect(intent.message).not.toMatch(/position:\s*absolute/i);
    }
  });

  it("does not treat a flex-container drag as a free move", () => {
    const intent = classifySemanticIntent(
      base({
        sameParent: true,
        sourceParentRole: "flex-container",
        targetParentRole: "flex-container",
      }),
    );
    expect(intent.kind).toBe("reorder-child");
  });
});
