import { describe, expect, it } from "vitest";

import {
  createInitialState,
  createPointerId,
  DRAG_THRESHOLD_PX,
  exceedsThreshold,
  INTERACTION_STATES,
  isPointerOwningState,
  PACKAGE_NAME,
  POINTER_OWNING_STATES,
  transition,
} from "./index.js";

describe("interaction-machine public API", () => {
  it("exposes the package name sentinel", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/interaction-machine");
  });

  it("exports the full PRD section 10 hierarchical state set", () => {
    expect(INTERACTION_STATES).toEqual([
      "idle",
      "hovering",
      "verifying",
      "disconnected",
      "selected",
      "selected.editing-style",
      "selected.editing-text",
      "selected.preparing-drag",
      "selected.dragging",
      "selected.dragging.reorder-preview",
      "selected.dragging.reparent-preview",
      "selected.dragging.free-position-preview",
      "selected.resizing",
      "selected.marquee-selecting",
      "selected.awaiting-commit",
    ]);
    // A machine state carries ONE value, not a flag bag.
    expect(createInitialState().value).toBe("idle");
  });

  it("pointer-owning states are the drag/resize/marquee gesture leaves", () => {
    expect(POINTER_OWNING_STATES).toEqual([
      "selected.preparing-drag",
      "selected.dragging",
      "selected.dragging.reorder-preview",
      "selected.dragging.reparent-preview",
      "selected.dragging.free-position-preview",
      "selected.resizing",
      "selected.marquee-selecting",
    ]);
    expect(isPointerOwningState("selected.dragging")).toBe(true);
    expect(isPointerOwningState("selected.resizing")).toBe(true);
    expect(isPointerOwningState("selected")).toBe(false);
  });

  it("reducer is reachable through the barrel", () => {
    const after = transition(createInitialState(), { type: "pick-start" });
    expect(after.state.value).toBe("hovering");
  });

  it("drag threshold and pointer id construction are reachable through the barrel", () => {
    expect(typeof DRAG_THRESHOLD_PX).toBe("number");
    expect(exceedsThreshold({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false);
    expect(createPointerId("p1")).toBe("p1");
  });
});
