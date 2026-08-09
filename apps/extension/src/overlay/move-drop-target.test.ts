import type { Rect } from "@vision-control/geometry";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveMoveDropTarget } from "./move-drop-target.js";

const setRect = (element: Element, rect: Rect): void => {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    left: rect.x,
    toJSON: () => ({}),
  });
};

const request = (dragged: Element, sourceParent: Element, pointer = { x: 100, y: 100 }) => ({
  document,
  root: document,
  overlayHost: document.createElement("div"),
  dragged,
  sourceParent,
  pointer,
  movingOrder: 0,
  sourceIndex: 0,
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("resolveMoveDropTarget", () => {
  it("continues past an invalid inner candidate to a valid outer target", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    source.appendChild(dragged);
    const outer = document.createElement("div");
    outer.style.display = "flex";
    const invalidInner = document.createElement("ul");
    outer.appendChild(invalidInner);
    document.body.append(source, outer);
    setRect(source, { x: 0, y: 0, width: 40, height: 40 });
    setRect(dragged, { x: 0, y: 0, width: 20, height: 20 });
    setRect(outer, { x: 50, y: 50, width: 200, height: 100 });
    setRect(invalidInner, { x: 60, y: 60, width: 40, height: 40 });
    document.elementsFromPoint = (() => [invalidInner, outer]) as typeof document.elementsFromPoint;

    const resolution = resolveMoveDropTarget(request(dragged, source));

    expect(resolution).toMatchObject({
      kind: "valid",
      targetElement: outer,
      candidate: { layoutRole: "flex-container" },
    });
  });

  it("does not retain an outer target after entering a valid nested target", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    source.appendChild(dragged);
    const outer = document.createElement("div");
    outer.style.flexDirection = "column";
    outer.style.display = "flex";
    const inner = document.createElement("div");
    outer.appendChild(inner);
    document.body.append(source, outer);
    setRect(source, { x: 0, y: 0, width: 40, height: 40 });
    setRect(dragged, { x: 0, y: 0, width: 20, height: 20 });
    setRect(outer, { x: 50, y: 50, width: 200, height: 100 });
    setRect(inner, { x: 60, y: 60, width: 80, height: 60 });
    document.elementsFromPoint = (() => [outer]) as typeof document.elementsFromPoint;

    const first = resolveMoveDropTarget(request(dragged, source, { x: 75, y: 75 }));
    expect(first).toMatchObject({ kind: "valid", targetElement: outer });
    if (first.kind !== "valid") return;

    document.elementsFromPoint = (() => [inner, outer]) as typeof document.elementsFromPoint;
    expect(
      resolveMoveDropTarget({
        ...request(dragged, source, { x: 75, y: 75 }),
        previous: first,
      }),
    ).toMatchObject({ kind: "valid", targetElement: inner });
  });

  it("returns the ranked invalid resolution only when no valid candidate remains", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    source.appendChild(dragged);
    const invalid = document.createElement("ul");
    document.body.append(source, invalid);
    setRect(source, { x: 0, y: 0, width: 40, height: 40 });
    setRect(dragged, { x: 0, y: 0, width: 20, height: 20 });
    setRect(invalid, { x: 50, y: 50, width: 100, height: 100 });
    document.elementsFromPoint = (() => [invalid]) as typeof document.elementsFromPoint;

    expect(resolveMoveDropTarget(request(dragged, source))).toMatchObject({
      kind: "invalid",
      targetElement: invalid,
      diagnostic: { code: "invalid-drop-target" },
    });
  });
});
