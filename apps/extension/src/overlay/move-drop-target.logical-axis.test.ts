import type { Rect } from "@vision-control/geometry";
import {
  beginReparent,
  type CandidateContainer,
  createPointerId,
  evaluateDropTarget,
} from "@vision-control/interaction-machine";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MovePlacementDiagnostic } from "../components/interaction/reorder-dom-context.js";
import { resolveMoveDropTarget } from "./move-drop-target.js";

type MovePointer = { readonly x: number; readonly y: number };

const setRect = (element: Element, rect: Rect): void => {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
    new DOMRect(rect.x, rect.y, rect.width, rect.height),
  );
};

const evaluate = (candidate: CandidateContainer, pointer: MovePointer) => {
  const session = beginReparent(
    createPointerId("logical-move-drop"),
    { ref: { runtimeId: "dragged", tagName: "div" }, tagName: "div" },
    { ref: { runtimeId: "source", tagName: "section" }, tagName: "section" },
    0,
  );
  return evaluateDropTarget(session, pointer.x, pointer.y, [candidate]).evaluation;
};

const createFixture = (cssText: string, rects: readonly Rect[]) => {
  const source = document.createElement("section");
  const dragged = document.createElement("div");
  const target = document.createElement("section");
  target.style.cssText = cssText;
  const children = rects.map(() => document.createElement("div"));
  source.appendChild(dragged);
  target.append(...children);
  document.body.append(source, target);
  setRect(source, { x: 300, y: 0, width: 100, height: 100 });
  setRect(dragged, { x: 310, y: 10, width: 50, height: 30 });
  setRect(target, { x: 0, y: 0, width: 200, height: 200 });
  for (const [index, child] of children.entries()) {
    const rect = rects[index];
    if (rect !== undefined) setRect(child, rect);
  }
  return { source, dragged, target, children };
};

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("resolveMoveDropTarget logical-axis placement", () => {
  it("maps a row-reverse visual boundary to literal DOM index 2", () => {
    const fixture = createFixture(
      "display:flex;flex-direction:row-reverse;direction:ltr;writing-mode:horizontal-tb",
      [
        { x: 140, y: 0, width: 50, height: 40 },
        { x: 70, y: 0, width: 50, height: 40 },
        { x: 0, y: 0, width: 50, height: 40 },
      ],
    );
    const pointer = { x: 40, y: 20 };

    const candidate = resolveMoveDropTarget({
      document,
      dragged: fixture.dragged,
      sourceParent: fixture.source,
      pointer,
    });

    expect(candidate).not.toBeNull();
    expect(candidate === null ? null : evaluate(candidate, pointer).target?.index).toBe(2);
  });

  it("maps an RTL row visual boundary to literal DOM index 2", () => {
    const fixture = createFixture(
      "display:flex;flex-direction:row;direction:rtl;writing-mode:horizontal-tb",
      [
        { x: 140, y: 0, width: 50, height: 40 },
        { x: 70, y: 0, width: 50, height: 40 },
        { x: 0, y: 0, width: 50, height: 40 },
      ],
    );
    const pointer = { x: 40, y: 20 };

    const candidate = resolveMoveDropTarget({
      document,
      dragged: fixture.dragged,
      sourceParent: fixture.source,
      pointer,
    });

    expect(candidate === null ? null : evaluate(candidate, pointer).target?.index).toBe(2);
  });

  it("uses the physical Y axis for a row in vertical writing mode", () => {
    const fixture = createFixture(
      "display:flex;flex-direction:row;direction:ltr;writing-mode:vertical-rl",
      [
        { x: 0, y: 0, width: 40, height: 50 },
        { x: 0, y: 70, width: 40, height: 50 },
        { x: 0, y: 140, width: 40, height: 50 },
      ],
    );
    const pointer = { x: 20, y: 130 };

    const candidate = resolveMoveDropTarget({
      document,
      dragged: fixture.dragged,
      sourceParent: fixture.source,
      pointer,
    });

    expect(candidate === null ? null : evaluate(candidate, pointer).target?.index).toBe(2);
  });

  it("rejects a target whose direct children use nonzero CSS order", () => {
    const fixture = createFixture(
      "display:flex;flex-direction:row;direction:ltr;writing-mode:horizontal-tb",
      [
        { x: 0, y: 0, width: 50, height: 40 },
        { x: 70, y: 0, width: 50, height: 40 },
      ],
    );
    const orderedChild = fixture.children[1];
    if (orderedChild !== undefined) orderedChild.style.order = "2";
    const diagnostics: MovePlacementDiagnostic[] = [];

    const candidate = resolveMoveDropTarget({
      document,
      dragged: fixture.dragged,
      sourceParent: fixture.source,
      pointer: { x: 80, y: 20 },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(candidate).toBeNull();
    expect(diagnostics).toContainEqual(expect.objectContaining({ kind: "css-order-warning" }));
  });

  it("surfaces a diagnostic for self and descendant targets", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    const descendant = document.createElement("span");
    dragged.appendChild(descendant);
    source.appendChild(dragged);
    document.body.appendChild(source);
    setRect(source, { x: 0, y: 0, width: 200, height: 100 });
    setRect(dragged, { x: 10, y: 10, width: 100, height: 60 });
    setRect(descendant, { x: 20, y: 20, width: 60, height: 30 });
    const diagnostics: MovePlacementDiagnostic[] = [];

    const candidate = resolveMoveDropTarget({
      document,
      dragged,
      sourceParent: source,
      pointer: { x: 30, y: 30 },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(candidate).toBeNull();
    expect(diagnostics).toContainEqual(expect.objectContaining({ kind: "unsupported-context" }));
  });

  it("surfaces an invalid content-model target without producing a candidate", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    const target = document.createElement("ul");
    source.appendChild(dragged);
    document.body.append(source, target);
    setRect(source, { x: 300, y: 0, width: 100, height: 100 });
    setRect(dragged, { x: 310, y: 10, width: 50, height: 30 });
    setRect(target, { x: 0, y: 0, width: 200, height: 100 });
    const diagnostics: MovePlacementDiagnostic[] = [];

    const candidate = resolveMoveDropTarget({
      document,
      dragged,
      sourceParent: source,
      pointer: { x: 30, y: 30 },
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
    });

    expect(candidate).toBeNull();
    expect(diagnostics).toContainEqual(expect.objectContaining({ kind: "unsupported-context" }));
  });

  it("preserves signed 25/50/25 zones around a nested row-reverse container", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    const targetParent = document.createElement("div");
    targetParent.style.cssText =
      "display:flex;flex-direction:row-reverse;direction:ltr;writing-mode:horizontal-tb";
    const before = document.createElement("div");
    const container = document.createElement("section");
    const content = document.createElement("div");
    const after = document.createElement("div");
    source.appendChild(dragged);
    container.appendChild(content);
    targetParent.append(before, container, after);
    document.body.append(source, targetParent);
    setRect(source, { x: 400, y: 0, width: 100, height: 100 });
    setRect(dragged, { x: 410, y: 10, width: 50, height: 30 });
    setRect(targetParent, { x: 0, y: 0, width: 300, height: 100 });
    setRect(before, { x: 210, y: 10, width: 80, height: 80 });
    setRect(container, { x: 100, y: 10, width: 100, height: 80 });
    setRect(content, { x: 140, y: 40, width: 20, height: 20 });
    setRect(after, { x: 10, y: 10, width: 80, height: 80 });

    const mainStart = resolveMoveDropTarget({
      document,
      dragged,
      sourceParent: source,
      pointer: { x: 180, y: 50 },
    });
    const center = resolveMoveDropTarget({
      document,
      dragged,
      sourceParent: source,
      pointer: { x: 150, y: 50 },
    });
    const mainEnd = resolveMoveDropTarget({
      document,
      dragged,
      sourceParent: source,
      pointer: { x: 120, y: 50 },
    });

    expect(mainStart?.parent.ref.runtimeId).toBe(targetParent.getAttribute("data-vc-preview-id"));
    expect(center?.parent.ref.runtimeId).toBe(container.getAttribute("data-vc-preview-id"));
    expect(mainEnd?.parent.ref.runtimeId).toBe(targetParent.getAttribute("data-vc-preview-id"));
    expect(mainStart === null ? null : evaluate(mainStart, { x: 180, y: 50 }).target?.index).toBe(
      1,
    );
    expect(mainEnd === null ? null : evaluate(mainEnd, { x: 120, y: 50 }).target?.index).toBe(2);
  });
});
