import type { Rect } from "@vision-control/geometry";
import {
  beginReparent,
  type CandidateContainer,
  createPointerId,
  evaluateDropTarget,
} from "@vision-control/interaction-machine";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveMoveDropTarget } from "./move-drop-target.js";

function setRect(element: Element, rect: Rect): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
    new DOMRect(rect.x, rect.y, rect.width, rect.height),
  );
}

function evaluate(candidate: CandidateContainer, pointerX: number, pointerY: number) {
  const session = beginReparent(
    createPointerId("move-drop-target"),
    { ref: { runtimeId: "dragged", tagName: "div" }, tagName: "div" },
    { ref: { runtimeId: "source", tagName: "section" }, tagName: "section" },
    0,
  );
  return evaluateDropTarget(session, pointerX, pointerY, [candidate]).evaluation;
}

function resolve(
  dragged: Element,
  sourceParent: Element,
  pointer: MovePointer,
): CandidateContainer | null {
  return resolveMoveDropTarget({
    document,
    dragged,
    sourceParent,
    pointer,
  });
}

type MovePointer = { readonly x: number; readonly y: number };

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("resolveMoveDropTarget", () => {
  it("resolves a cross-parent middle leaf through its parent before the leaf", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    const target = document.createElement("section");
    target.style.display = "flex";
    target.style.flexDirection = "column";
    const first = document.createElement("div");
    const middle = document.createElement("div");
    const last = document.createElement("div");
    source.appendChild(dragged);
    target.append(first, middle, last);
    document.body.append(source, target);
    setRect(source, { x: 0, y: 0, width: 120, height: 180 });
    setRect(dragged, { x: 10, y: 10, width: 60, height: 30 });
    setRect(target, { x: 200, y: 0, width: 160, height: 180 });
    setRect(first, { x: 210, y: 10, width: 140, height: 50 });
    setRect(middle, { x: 210, y: 70, width: 140, height: 50 });
    setRect(last, { x: 210, y: 130, width: 140, height: 40 });

    const candidate = resolve(dragged, source, { x: 240, y: 80 });

    expect(candidate?.parent.tagName).toBe("section");
    expect(candidate?.children).toHaveLength(3);
    const evaluation = candidate === null ? null : evaluate(candidate, 240, 80);
    expect(evaluation?.target?.index).toBe(1);
    expect(evaluation?.target?.indicator).toEqual({ axis: "y", position: 65 });
  });

  it("resolves a cross-parent leaf trailing half after the leaf", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    const target = document.createElement("section");
    target.style.display = "flex";
    target.style.flexDirection = "column";
    const first = document.createElement("div");
    const middle = document.createElement("div");
    const last = document.createElement("div");
    source.appendChild(dragged);
    target.append(first, middle, last);
    document.body.append(source, target);
    setRect(source, { x: 0, y: 0, width: 120, height: 180 });
    setRect(dragged, { x: 10, y: 10, width: 60, height: 30 });
    setRect(target, { x: 200, y: 0, width: 160, height: 180 });
    setRect(first, { x: 210, y: 10, width: 140, height: 50 });
    setRect(middle, { x: 210, y: 70, width: 140, height: 50 });
    setRect(last, { x: 210, y: 130, width: 140, height: 40 });

    const candidate = resolve(dragged, source, { x: 240, y: 110 });

    const evaluation = candidate === null ? null : evaluate(candidate, 240, 110);
    expect(evaluation?.target?.index).toBe(2);
    expect(evaluation?.target?.indicator).toEqual({ axis: "y", position: 125 });
  });

  it("normalizes nested sibling markup before resolving leading and trailing zones", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    const target = document.createElement("section");
    target.style.display = "flex";
    target.style.flexDirection = "column";
    const first = document.createElement("div");
    const middle = document.createElement("div");
    const middleText = document.createElement("span");
    const last = document.createElement("div");
    middle.appendChild(middleText);
    source.appendChild(dragged);
    target.append(first, middle, last);
    document.body.append(source, target);
    setRect(source, { x: 0, y: 0, width: 120, height: 180 });
    setRect(dragged, { x: 10, y: 10, width: 60, height: 30 });
    setRect(target, { x: 200, y: 0, width: 160, height: 180 });
    setRect(first, { x: 210, y: 10, width: 140, height: 50 });
    setRect(middle, { x: 210, y: 70, width: 140, height: 50 });
    setRect(middleText, { x: 220, y: 70, width: 100, height: 50 });
    setRect(last, { x: 210, y: 130, width: 140, height: 40 });

    const leading = resolve(dragged, source, { x: 240, y: 80 });
    const trailing = resolve(dragged, source, { x: 240, y: 110 });

    expect(leading?.parent.tagName).toBe("section");
    expect(trailing?.parent.tagName).toBe("section");
    expect(leading === null ? null : evaluate(leading, 240, 80).target?.index).toBe(1);
    expect(trailing === null ? null : evaluate(trailing, 240, 110).target?.index).toBe(2);
  });

  it("normalizes a nested multi-child wrapper to its direct sibling below an explicit container", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    const target = document.createElement("section");
    target.style.display = "flex";
    target.style.flexDirection = "column";
    const first = document.createElement("div");
    const middle = document.createElement("div");
    const middleLabel = document.createElement("span");
    const middleDetail = document.createElement("span");
    const last = document.createElement("div");
    middle.append(middleLabel, middleDetail);
    source.appendChild(dragged);
    target.append(first, middle, last);
    document.body.append(source, target);
    setRect(source, { x: 0, y: 0, width: 120, height: 180 });
    setRect(dragged, { x: 10, y: 10, width: 60, height: 30 });
    setRect(target, { x: 200, y: 0, width: 160, height: 180 });
    setRect(first, { x: 210, y: 10, width: 140, height: 50 });
    setRect(middle, { x: 210, y: 70, width: 140, height: 40 });
    setRect(middleLabel, { x: 220, y: 70, width: 100, height: 20 });
    setRect(middleDetail, { x: 220, y: 90, width: 100, height: 20 });
    setRect(last, { x: 210, y: 120, width: 140, height: 40 });

    const leading = resolve(dragged, source, { x: 240, y: 79 });
    const atLeadingBoundary = resolve(dragged, source, { x: 240, y: 80 });
    const center = resolve(dragged, source, { x: 240, y: 90 });
    const atTrailingBoundary = resolve(dragged, source, { x: 240, y: 100 });
    const trailing = resolve(dragged, source, { x: 240, y: 101 });

    expect(leading?.parent.ref.runtimeId).toBe(target.getAttribute("data-vc-preview-id"));
    expect(leading === null ? null : evaluate(leading, 240, 79).target?.index).toBe(1);
    expect(atLeadingBoundary?.parent.ref.runtimeId).toBe(middle.getAttribute("data-vc-preview-id"));
    expect(center?.parent.ref.runtimeId).toBe(middle.getAttribute("data-vc-preview-id"));
    expect(atTrailingBoundary?.parent.ref.runtimeId).toBe(
      middle.getAttribute("data-vc-preview-id"),
    );
    expect(trailing?.parent.ref.runtimeId).toBe(target.getAttribute("data-vc-preview-id"));
    expect(trailing === null ? null : evaluate(trailing, 240, 101).target?.index).toBe(2);
  });

  it("uses leading, center, and trailing container zones along the parent flow axis", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    const targetParent = document.createElement("div");
    targetParent.style.display = "flex";
    targetParent.style.flexDirection = "row";
    const before = document.createElement("div");
    const container = document.createElement("section");
    const content = document.createElement("div");
    const after = document.createElement("div");
    source.appendChild(dragged);
    container.appendChild(content);
    targetParent.append(before, container, after);
    document.body.append(source, targetParent);
    setRect(source, { x: 0, y: 0, width: 120, height: 180 });
    setRect(dragged, { x: 10, y: 10, width: 60, height: 30 });
    setRect(targetParent, { x: 200, y: 0, width: 300, height: 100 });
    setRect(before, { x: 210, y: 10, width: 80, height: 80 });
    setRect(container, { x: 300, y: 10, width: 100, height: 80 });
    setRect(content, { x: 340, y: 70, width: 20, height: 10 });
    setRect(after, { x: 410, y: 10, width: 80, height: 80 });

    const leading = resolve(dragged, source, { x: 320, y: 50 });
    const center = resolve(dragged, source, { x: 350, y: 50 });
    const trailing = resolve(dragged, source, { x: 380, y: 50 });

    expect(leading?.parent.tagName).toBe("div");
    expect(center?.parent.tagName).toBe("section");
    expect(trailing?.parent.tagName).toBe("div");
    expect(leading === null ? null : evaluate(leading, 320, 50).target?.index).toBe(1);
    expect(center === null ? null : evaluate(center, 350, 50).target?.index).toBe(0);
    expect(trailing === null ? null : evaluate(trailing, 380, 50).target?.index).toBe(2);
  });

  it("resolves every empty eligible container zone inside at index zero", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    const targetParent = document.createElement("div");
    const target = document.createElement("section");
    source.appendChild(dragged);
    targetParent.appendChild(target);
    document.body.append(source, targetParent);
    setRect(source, { x: 0, y: 0, width: 120, height: 180 });
    setRect(dragged, { x: 10, y: 10, width: 60, height: 30 });
    setRect(targetParent, { x: 200, y: 0, width: 160, height: 180 });
    setRect(target, { x: 200, y: 0, width: 160, height: 160 });

    const leading = resolve(dragged, source, { x: 240, y: 10 });
    const center = resolve(dragged, source, { x: 240, y: 80 });
    const trailing = resolve(dragged, source, { x: 240, y: 150 });

    expect(leading?.parent.tagName).toBe("section");
    expect(center?.parent.tagName).toBe("section");
    expect(trailing?.parent.tagName).toBe("section");
    expect(leading === null ? null : evaluate(leading, 240, 10).target?.index).toBe(0);
    expect(center === null ? null : evaluate(center, 240, 80).target?.index).toBe(0);
    expect(trailing === null ? null : evaluate(trailing, 240, 150).target?.index).toBe(0);
  });

  it("rejects self, descendants, and a leaf in the source parent", () => {
    const source = document.createElement("section");
    source.style.display = "flex";
    const dragged = document.createElement("div");
    const descendant = document.createElement("span");
    const sibling = document.createElement("div");
    dragged.appendChild(descendant);
    source.append(dragged, sibling);
    document.body.appendChild(source);
    setRect(source, { x: 0, y: 0, width: 240, height: 120 });
    setRect(dragged, { x: 10, y: 10, width: 80, height: 80 });
    setRect(descendant, { x: 20, y: 20, width: 40, height: 40 });
    setRect(sibling, { x: 120, y: 10, width: 80, height: 80 });

    expect(resolve(dragged, source, { x: 30, y: 30 })).toBeNull();
    expect(resolve(dragged, source, { x: 140, y: 30 })).toBeNull();
  });
});
