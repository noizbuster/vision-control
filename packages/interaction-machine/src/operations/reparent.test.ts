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
  type ReparentRiskKind,
} from "./reparent.js";

const EXPECTED_RISK_KINDS: readonly ReparentRiskKind[] = [
  "portal",
  "repeated-instance",
  "provider",
  "source-file",
  "content-model",
  "label-association",
  "form-ownership",
  "slot-shadow-boundary",
  "render-prop",
  "context-provider-outside",
  "server-client-boundary",
  "cross-file-prop-dependency",
];

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
  layoutRole: "normal-flow-block" | "flex-container" = "normal-flow-block",
  overrides: Omit<Partial<ReparentElementDescriptor>, "ref" | "tagName"> & {
    readonly flexDirection?: string;
  } = {},
): CandidateContainer => {
  const { flexDirection, ...rest } = overrides;
  return {
    parent: makeDescriptor(runtimeId, tagName, rest),
    layoutRole,
    ...(flexDirection !== undefined ? { flexDirection } : {}),
    rect: r,
    children: [],
  };
};

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

  it("computes insertion index inside a column-direction flex-container", () => {
    const element = makeDescriptor("el-1", "div");
    const sourceParent = makeDescriptor("parent-1", "section");
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target: CandidateContainer = {
      parent: makeDescriptor("target-1", "section"),
      layoutRole: "flex-container",
      flexDirection: "column",
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
    const target = container("target-1", "section", rect(0, 0, 200, 200), "normal-flow-block", {
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
    const target = container("target-1", "section", rect(0, 0, 200, 200), "normal-flow-block", {
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
    const target = container("target-1", "section", rect(0, 0, 200, 200), "normal-flow-block", {
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

describe("PRD §9.4 risk coverage (12 kinds)", () => {
  // sourceFile set on both sides suppresses the source-file risk so each
  // scenario triggers only its intended kind.
  const mapped = { sourceFile: "src/App.tsx" };

  const mappedContainer = (
    runtimeId: string,
    tagName: string,
    overrides: Omit<Partial<ReparentElementDescriptor>, "ref" | "tagName"> = {},
  ): CandidateContainer =>
    container(runtimeId, tagName, rect(0, 0, 200, 200), "normal-flow-block", {
      ...mapped,
      ...overrides,
    });

  it("warns about label-association when reparenting a <label>'s control", () => {
    const element = makeDescriptor("el-1", "input", { isLabelControl: true, ...mapped });
    const sourceParent = makeDescriptor("parent-1", "label", mapped);
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = mappedContainer("target-1", "section");

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.risks.some((r) => r.kind === "label-association")).toBe(true);
  });

  it("warns about form-ownership when reparenting a form field out of a <form>", () => {
    const element = makeDescriptor("el-1", "input", { isFormField: true, ...mapped });
    const sourceParent = makeDescriptor("parent-1", "form", mapped);
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = mappedContainer("target-1", "section");

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.risks.some((r) => r.kind === "form-ownership")).toBe(true);
  });

  it("warns about slot-shadow-boundary when crossing a shadow root", () => {
    const element = makeDescriptor("el-1", "div", { isInShadowRoot: true, ...mapped });
    const sourceParent = makeDescriptor("parent-1", "div", mapped);
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = mappedContainer("target-1", "section");

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.risks.some((r) => r.kind === "slot-shadow-boundary")).toBe(true);
    expect(next.feasibility.sourcePatch).toBe("unsafe");
  });

  it("warns about render-prop when the element is a render-prop child", () => {
    const element = makeDescriptor("el-1", "div", { isRenderPropChild: true, ...mapped });
    const sourceParent = makeDescriptor("parent-1", "div", mapped);
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = mappedContainer("target-1", "section");

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.risks.some((r) => r.kind === "render-prop")).toBe(true);
    expect(next.feasibility.sourcePatch).toBe("unsafe");
  });

  it("warns about context-provider-outside when reparenting out of a context provider", () => {
    const element = makeDescriptor("el-1", "div", { isContextConsumer: true, ...mapped });
    const sourceParent = makeDescriptor("parent-1", "div", { isContextProvider: true, ...mapped });
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = mappedContainer("target-1", "section");

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.risks.some((r) => r.kind === "context-provider-outside")).toBe(true);
  });

  it("warns about server-client-boundary when crossing server/client", () => {
    const element = makeDescriptor("el-1", "div", { isServerComponent: true, ...mapped });
    const sourceParent = makeDescriptor("parent-1", "div", mapped);
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = mappedContainer("target-1", "section");

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.risks.some((r) => r.kind === "server-client-boundary")).toBe(true);
    expect(next.feasibility.sourcePatch).toBe("unsafe");
  });

  it("warns about cross-file-prop-dependency for differing files with prop dep", () => {
    const element = makeDescriptor("el-1", "div", {
      sourceFile: "src/Widget.tsx",
      hasPropDependency: true,
    });
    const sourceParent = makeDescriptor("parent-1", "div", { sourceFile: "src/Widget.tsx" });
    const session = beginReparent(pointerId, element, sourceParent, 0);
    const target = mappedContainer("target-1", "section");

    const { session: next } = evaluateDropTarget(session, 50, 50, [target]);

    expect(next.feasibility.risks.some((r) => r.kind === "cross-file-prop-dependency")).toBe(true);
    expect(next.feasibility.sourcePatch).toBe("unsafe");
  });

  it("collects all 12 PRD §9.4 risk kinds across scenarios", () => {
    const scenarios: Array<{
      element: ReparentElementDescriptor;
      source: ReparentElementDescriptor;
      target: CandidateContainer;
    }> = [
      {
        element: makeDescriptor("el", "div", { isPortal: true, ...mapped }),
        source: makeDescriptor("p", "section", mapped),
        target: mappedContainer("t", "section"),
      },
      {
        element: makeDescriptor("el", "div", { isRepeatedInstance: true, ...mapped }),
        source: makeDescriptor("p", "section", mapped),
        target: mappedContainer("t", "section"),
      },
      {
        element: makeDescriptor("el", "div", mapped),
        source: makeDescriptor("p", "section", mapped),
        target: mappedContainer("t", "section", { isProvider: true }),
      },
      {
        element: makeDescriptor("el", "div"),
        source: makeDescriptor("p", "section"),
        target: container("t", "section", rect(0, 0, 200, 200)),
      },
      {
        element: makeDescriptor("el", "div", mapped),
        source: makeDescriptor("p", "ul", mapped),
        target: mappedContainer("t", "ul"),
      },
      {
        element: makeDescriptor("el", "input", { isLabelControl: true, ...mapped }),
        source: makeDescriptor("p", "label", mapped),
        target: mappedContainer("t", "section"),
      },
      {
        element: makeDescriptor("el", "input", { isFormField: true, ...mapped }),
        source: makeDescriptor("p", "form", mapped),
        target: mappedContainer("t", "section"),
      },
      {
        element: makeDescriptor("el", "div", { isInShadowRoot: true, ...mapped }),
        source: makeDescriptor("p", "div", mapped),
        target: mappedContainer("t", "section"),
      },
      {
        element: makeDescriptor("el", "div", { isRenderPropChild: true, ...mapped }),
        source: makeDescriptor("p", "div", mapped),
        target: mappedContainer("t", "section"),
      },
      {
        element: makeDescriptor("el", "div", { isContextConsumer: true, ...mapped }),
        source: makeDescriptor("p", "div", { isContextProvider: true, ...mapped }),
        target: mappedContainer("t", "section"),
      },
      {
        element: makeDescriptor("el", "div", { isServerComponent: true, ...mapped }),
        source: makeDescriptor("p", "div", mapped),
        target: mappedContainer("t", "section"),
      },
      {
        element: makeDescriptor("el", "div", {
          sourceFile: "src/A.tsx",
          hasPropDependency: true,
        }),
        source: makeDescriptor("p", "div", { sourceFile: "src/A.tsx" }),
        target: container("t", "section", rect(0, 0, 200, 200), "normal-flow-block", {
          sourceFile: "src/B.tsx",
        }),
      },
    ];

    const firedKinds = new Set<ReparentRiskKind>();
    for (const { element, source, target } of scenarios) {
      const session = beginReparent(pointerId, element, source, 0);
      const { session: next } = evaluateDropTarget(session, 50, 50, [target]);
      for (const risk of next.feasibility.risks) {
        firedKinds.add(risk.kind);
      }
    }

    expect(firedKinds.size).toBe(12);
    for (const kind of EXPECTED_RISK_KINDS) {
      expect(firedKinds.has(kind)).toBe(true);
    }
  });
});

describe("endReparent unsafe guard", () => {
  it("rejects an unsafe reparent (no auto-commit when a guard fires)", () => {
    const element = makeDescriptor("el-1", "div", {
      isRenderPropChild: true,
      sourceFile: "src/App.tsx",
    });
    const sourceParent = makeDescriptor("parent-1", "section", { sourceFile: "src/App.tsx" });
    let session = beginReparent(pointerId, element, sourceParent, 0);
    const target = container("target-1", "section", rect(0, 0, 200, 200), "normal-flow-block", {
      sourceFile: "src/App.tsx",
    });

    ({ session } = evaluateDropTarget(session, 50, 50, [target]));
    expect(session.feasibility.sourcePatch).toBe("unsafe");

    const result = endReparent(session);

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toContain("Unsafe reparent boundary");
  });

  it("commits an agent-required reparent (runtime preview allowed)", () => {
    const element = makeDescriptor("el-1", "div", {
      isLabelControl: true,
      sourceFile: "src/App.tsx",
    });
    const sourceParent = makeDescriptor("parent-1", "label", { sourceFile: "src/App.tsx" });
    let session = beginReparent(pointerId, element, sourceParent, 0);
    const target = container("target-1", "section", rect(0, 0, 200, 200), "normal-flow-block", {
      sourceFile: "src/App.tsx",
    });

    ({ session } = evaluateDropTarget(session, 50, 50, [target]));
    expect(session.feasibility.sourcePatch).toBe("agent-required");

    const result = endReparent(session);

    expect(result.status).toBe("committed");
  });
});
