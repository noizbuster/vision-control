import { describe, expect, it } from "vitest";

import { createPointerId } from "../pointer-ownership.js";
import { createResizeOperation } from "./resize.js";

const target = {
  element: { runtimeId: "runtime-001" },
  property: "width" as const,
  axis: "x" as const,
  fromValue: 100,
  unit: "px",
  rect: { x: 0, y: 0, width: 100, height: 50 },
};

const flexTarget = {
  element: { runtimeId: "runtime-002" },
  property: "flex-basis" as const,
  axis: "x" as const,
  fromValue: 120,
  unit: "px",
  rect: { x: 0, y: 0, width: 120, height: 60 },
};

const pointerId = createPointerId("pointer-001");

describe("createResizeOperation", () => {
  it("starts in idle phase", () => {
    const op = createResizeOperation();
    expect(op.getPhase()).toBe("idle");
  });

  it("transitions idle -> resize-pending on beginResize", () => {
    const op = createResizeOperation();
    op.beginResize("e", pointerId, target);
    expect(op.getPhase()).toBe("resize-pending");
  });

  it("throws when beginResize is called while already active", () => {
    const op = createResizeOperation();
    op.beginResize("e", pointerId, target);
    expect(() => op.beginResize("e", pointerId, target)).toThrow();
  });

  it("returns null from updateResize before beginResize", () => {
    const op = createResizeOperation();
    expect(op.updateResize(10, 0, { shift: false, alt: false })).toBeNull();
  });

  it("computes a width preview from an east-handle drag", () => {
    const op = createResizeOperation();
    op.beginResize("e", pointerId, target);
    const preview = op.updateResize(30, 5, { shift: false, alt: false });
    expect(preview).toEqual({ property: "width", value: 130, unit: "px" });
  });

  it("computes a height preview from a south-handle drag", () => {
    const op = createResizeOperation();
    op.beginResize("s", pointerId, { ...target, property: "height", axis: "y" });
    const preview = op.updateResize(5, 25, { shift: false, alt: false });
    expect(preview).toEqual({ property: "height", value: 125, unit: "px" });
  });

  it("moves from resize-pending to resizing once the threshold is exceeded", () => {
    const op = createResizeOperation();
    op.beginResize("e", pointerId, target);
    op.updateResize(0.5, 0, { shift: false, alt: false });
    expect(op.getPhase()).toBe("resize-pending");
    op.updateResize(1, 0, { shift: false, alt: false });
    expect(op.getPhase()).toBe("resizing");
  });

  it("doubles the delta when alt is held (center-out)", () => {
    const op = createResizeOperation();
    op.beginResize("e", pointerId, target);
    const preview = op.updateResize(10, 0, { shift: false, alt: true });
    expect(preview?.value).toBe(120);
  });

  it("reverses direction for west-handle drag", () => {
    const op = createResizeOperation();
    op.beginResize("w", pointerId, target);
    const preview = op.updateResize(-20, 0, { shift: false, alt: false });
    expect(preview?.value).toBe(120);
  });

  it("reverses direction for north-handle drag", () => {
    const op = createResizeOperation();
    op.beginResize("n", pointerId, { ...target, property: "height", axis: "y" });
    const preview = op.updateResize(0, -15, { shift: false, alt: false });
    expect(preview?.value).toBe(115);
  });

  it("ignores orthogonal movement without shift for edge handles", () => {
    const op = createResizeOperation();
    op.beginResize("e", pointerId, target);
    const preview = op.updateResize(0, 40, { shift: false, alt: false });
    expect(preview?.value).toBe(100);
  });

  it("returns a resize-element operation on endResize", () => {
    const op = createResizeOperation();
    op.beginResize("e", pointerId, target);
    op.updateResize(30, 0, { shift: false, alt: false });
    const result = op.endResize();

    expect(result).not.toBeNull();
    expect(result?.operation.kind).toBe("resize-element");
    expect(result?.operation.property).toBe("width");
    expect(result?.operation.fromValue).toBe("100");
    expect(result?.operation.toValue).toBe("130");
    expect(result?.operation.unit).toBe("px");
    expect(result?.operation.runtime).toBe(false);
  });

  it("ends in the ended phase", () => {
    const op = createResizeOperation();
    op.beginResize("e", pointerId, target);
    op.updateResize(30, 0, { shift: false, alt: false });
    op.endResize();
    expect(op.getPhase()).toBe("ended");
  });

  it("returns null from endResize when no movement occurred", () => {
    const op = createResizeOperation();
    op.beginResize("e", pointerId, target);
    const result = op.endResize();
    expect(result).toBeNull();
  });

  it("supports flex-basis as the resize property", () => {
    const op = createResizeOperation();
    op.beginResize("e", pointerId, flexTarget);
    const preview = op.updateResize(-20, 0, { shift: false, alt: false });
    expect(preview).toEqual({ property: "flex-basis", value: 100, unit: "px" });
  });

  it("returns null from updateResize after endResize", () => {
    const op = createResizeOperation();
    op.beginResize("e", pointerId, target);
    op.updateResize(30, 0, { shift: false, alt: false });
    op.endResize();
    expect(op.updateResize(10, 0, { shift: false, alt: false })).toBeNull();
  });
});
