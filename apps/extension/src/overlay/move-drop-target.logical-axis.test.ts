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

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Move drop target logical axes", () => {
  it("retains a valid resolver key through its four-pixel activation hysteresis", () => {
    const source = document.createElement("section");
    const dragged = document.createElement("div");
    source.appendChild(dragged);
    const target = document.createElement("div");
    target.style.display = "flex";
    const child = document.createElement("div");
    target.appendChild(child);
    document.body.append(source, target);
    setRect(source, { x: 0, y: 0, width: 40, height: 40 });
    setRect(dragged, { x: 0, y: 0, width: 20, height: 20 });
    setRect(target, { x: 50, y: 50, width: 200, height: 100 });
    setRect(child, { x: 60, y: 60, width: 40, height: 40 });
    document.elementsFromPoint = (() => [target]) as typeof document.elementsFromPoint;
    const base = {
      document,
      root: document,
      overlayHost: document.createElement("div"),
      dragged,
      sourceParent: source,
      movingOrder: 0,
      sourceIndex: 0,
    };
    const first = resolveMoveDropTarget({ ...base, pointer: { x: 75, y: 75 } });
    expect(first.kind).toBe("valid");
    if (first.kind !== "valid") return;
    const retained = resolveMoveDropTarget({
      ...base,
      pointer: {
        x: first.activation.axis === "x" ? first.activation.end + 3 : 75,
        y: first.activation.axis === "y" ? first.activation.end + 3 : 75,
      },
      previous: first,
    });

    expect(retained).toMatchObject({ kind: "valid", key: first.key });
  });
});
