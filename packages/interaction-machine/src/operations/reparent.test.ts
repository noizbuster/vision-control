import { computeInverse } from "@vision-control/change-ir";
import type { ElementRef } from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";
import { describe, expect, it } from "vitest";

import { createPointerId } from "../pointer-ownership.js";
import {
  beginReparent,
  type CandidateContainer,
  cancelReparent,
  endReparent,
  evaluateDropTarget,
  type ReparentElementDescriptor,
} from "./reparent.js";

const pointerId = createPointerId("mouse-1");

const makeRef = (runtimeId: string, tagName: string): ElementRef => ({
  runtimeId,
  tagName,
});

const makeDescriptor = (
  runtimeId: string,
  tagName: string,
  overrides: Omit<Partial<ReparentElementDescriptor>, "ref" | "tagName"> = {},
): ReparentElementDescriptor => ({
  ref: makeRef(runtimeId, tagName),
  tagName,
  ...overrides,
});

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

const container = (
  runtimeId: string,
  tagName: string,
  r: Rect,
  layoutRole: "block" | "flex-column" = "block",
  overrides: Omit<Partial<ReparentElementDescriptor>, "ref" | "tagName"> = {},
): CandidateContainer => ({
  parent: makeDescriptor(runtimeId, tagName, overrides),
  layoutRole,
  rect: r,
  children: [],
});

describe("beginReparent", () => {
  it("captures source identity and starts in drag-pending", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    const session = beginReparent(pointerId, element, sourceParent, 2);

    expect(session.phase).toBe("drag-pending");
    expect(session.element.ref.runtimeId).toBe("el-1");
    expect(session.sourceParent.ref.runtimeId).toBe("parent-1");
    expect(session.sourceIndex).toBe(2);
    expect(session.currentTarget).toBeNull();
  });
});

describe("evaluateDropTarget", () => {
  it("returns valid when pointer is inside a compatible container", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = container("target-1", "section", rect(0, 0, 200, 200));

    const { evaluation } = evaluateDropTarget(session, 50, 50, [target]);

    expect(evaluation.validity).toBe("valid");
    expect(evaluation.target).not.toBeNull();
    expect(evaluation.target?.parent.runtimeId).toBe("target-1");
    expect(evaluation.reason).toBeNull();
  });

  it("returns pending when pointer is outside all containers", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = container("target-1", "section", rect(0, 0, 10, 10));

    const { evaluation } = evaluateDropTarget(session, 50, 50, [target]);

    expect(evaluation.validity).toBe("pending");
    expect(evaluation.target).toBeNull();
  });

  it("blocks div dropped directly into ul with INVALID_DROP_TARGET", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = container("target-1", "ul", rect(0, 0, 200, 200));

    const { evaluation, session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(evaluation.validity).toBe("invalid");
    expect(evaluation.reason).toContain("INVALID_DROP_TARGET");
    expect(next.phase).toBe("dragging-over-invalid-target");
    expect(next.feasibility.canReparent).toBe(false);
  });

  it("allows li dropped into ul", () => {
    const element = makeDescriptor("el-1", "li");
    const sourceParent = makeDescriptor("parent-1", "ul");
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = container("target-1", "ul", rect(0, 0, 200, 200));

    const { evaluation } = evaluateDropTarget(session, 50, 50, [target]);

    expect(evaluation.validity).toBe("valid");
  });

  it("computes insertion index inside flex-column container", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target: CandidateContainer = {
      parent: makeDescriptor("target-1", "section"),
      layoutRole: "flex-column",
      rect: rect(0, 0, 200, 300),
      children: [
        { rect: rect(0, 0, 200, 50) },
        { rect: rect(0, 50, 200, 50) },
        { rect: rect(0, 100, 200, 50) },
      ],
    };

    const { evaluation } = evaluateDropTarget(session, 10, 80, [target]);

    expect(evaluation.validity).toBe("valid");
    expect(evaluation.target?.index).toBe(2);
  });

  it("warns about portal source", () => {
    const element = makeDescriptor("el-1", "div", {
      isPortal: true,
      sourceFile: "src/Portal.tsx",
    });
    const sourceParent = makeDescriptor("parent-1", "section", { sourceFile: "src/Portal.tsx" });
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = container("target-1", "section", rect(0, 0, 200, 200), "block", {
      sourceFile: "src/Header.tsx",
    });

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.risks.some((r) => r.kind === "portal")).toBe(true);
    expect(next.feasibility.confidence).toBe("medium");
  });

  it("warns about repeated instance", () => {
    const element = makeDescriptor("el-1", "div", { isRepeatedInstance: true });
    const sourceParent = makeDescriptor("parent-1", "section");
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = container("target-1", "section", rect(0, 0, 200, 200));

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.risks.some((r) => r.kind === "repeated-instance")).toBe(true);
  });

  it("warns about provider target", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = container("target-1", "section", rect(0, 0, 200, 200), "block", {
      isProvider: true,
    });

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.risks.some((r) => r.kind === "provider")).toBe(true);
  });

  it("lowers confidence when source mapping is missing", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = container("target-1", "section", rect(0, 0, 200, 200));

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.confidence).toBe("low");
    expect(next.feasibility.risks.some((r) => r.kind === "source-file")).toBe(true);
  });

  it("high confidence when no risks are present", () => {
    const element = makeDescriptor("el-1", "div", { sourceFile: "src/App.tsx" });
    const sourceParent = makeDescriptor("parent-1", "section", { sourceFile: "src/App.tsx" });
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = container("target-1", "section", rect(0, 0, 200, 200), "block", {
      sourceFile: "src/Header.tsx",
    });

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.confidence).toBe("high");
    expect(next.feasibility.risks).toHaveLength(0);
  });
});

describe("endReparent", () => {
  it("commits a reparent-element operation when target is valid", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    let session = beginReparent(pointerId, element, sourceParent, 1);
    const target = container("target-1", "section", rect(0, 0, 200, 200));

    ({ session } = evaluateDropTarget(session, 50, 50, [target]));
    const result = endReparent(session);

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.operation.kind).toBe("reparent-element");
    expect(result.operation.element.runtimeId).toBe("el-1");
    expect(result.operation.sourceParent.runtimeId).toBe("parent-1");
    expect(result.operation.sourceIndex).toBe(1);
    expect(result.operation.targetParent.runtimeId).toBe("target-1");
    expect(result.operation.targetIndex).toBe(0);
  });

  it("rejects when no valid target was evaluated", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    const session = beginReparent(pointerId, element, sourceParent, 0);

    const result = endReparent(session);

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toContain("No valid drop target");
  });

  it("inverse restores original parent and index", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    let session = beginReparent(pointerId, element, sourceParent, 1);
    const target = container("target-1", "section", rect(0, 0, 200, 200));

    ({ session } = evaluateDropTarget(session, 50, 50, [target]));
    const result = endReparent(session);

    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    const inverse = computeInverse(result.operation);
    expect(inverse.kind).toBe("reparent-element");
    if (inverse.kind !== "reparent-element") return;
    expect(inverse.sourceParent.runtimeId).toBe("target-1");
    expect(inverse.sourceIndex).toBe(0);
    expect(inverse.targetParent.runtimeId).toBe("parent-1");
    expect(inverse.targetIndex).toBe(1);
  });
});

describe("cancelReparent", () => {
  it("moves session to rejected with a reason", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const cancelled = cancelReparent(session, "Escape pressed");

    expect(cancelled.phase).toBe("rejected");
    expect(cancelled.rejectionReason).toBe("Escape pressed");
  });
});
