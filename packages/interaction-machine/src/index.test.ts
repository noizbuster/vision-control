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

  it("exports the full PRD state set with exactly one current value", () => {
    expect(INTERACTION_STATES).toEqual([
      "idle",
      "inspecting",
      "selecting",
      "selected",
      "dragging",
      "resizing",
      "editing-text",
      "previewing",
    ]);
    // A machine state carries ONE value, not a flag bag.
    expect(createInitialState().value).toBe("idle");
  });

  it("pointer-owning states are exactly dragging and resizing", () => {
    expect(POINTER_OWNING_STATES).toEqual(["dragging", "resizing"]);
    expect(isPointerOwningState("dragging")).toBe(true);
    expect(isPointerOwningState("resizing")).toBe(true);
    expect(isPointerOwningState("selected")).toBe(false);
  });

  it("reducer is reachable through the barrel", () => {
    const after = transition(createInitialState(), { type: "pick-start" });
    expect(after.state.value).toBe("inspecting");
  });

  it("drag threshold and pointer id construction are reachable through the barrel", () => {
    expect(typeof DRAG_THRESHOLD_PX).toBe("number");
    expect(exceedsThreshold({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false);
    expect(createPointerId("p1")).toBe("p1");
  });
});
