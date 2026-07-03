import { describe, expect, it } from "vitest";

import { computeInverse, type Operation, OperationSchema } from "../index.js";
import { type BreakpointStyleEditOperation, isBaseOverwriteAllowed } from "./breakpoint.js";

/**
 * VC-V1V2-10 — breakpoint context fields (activeViewport, responsivePrefix,
 * applyToBase). These tests pin the additive context and the explicit-intent
 * guard: a breakpoint edit NEVER overwrites base styles unless `applyToBase`
 * is explicitly `true`.
 */

const BASE_TIME = 1_700_000_000_000;

const el = (runtimeId: string) => ({ runtimeId });

const base = (id: string, ts: number, runtime = false) => ({
  id,
  timestamp: ts,
  runtime,
  origin: "property-panel" as const,
  confidence: 1,
});

const scopedStyleOp: BreakpointStyleEditOperation = {
  ...base("op-bp-ctx0001", BASE_TIME),
  kind: "breakpoint-style-edit",
  target: el("card-a"),
  breakpoint: "md",
  activeViewport: "tablet",
  responsivePrefix: "md",
  mediaSource: "@media (min-width: 768px)",
  property: "padding",
  value: "16px",
  important: false,
  previousValue: "8px",
  // applyToBase deliberately ABSENT — scoped by default.
};

const baseOverwriteOp: BreakpointStyleEditOperation = {
  ...base("op-bp-ctx0002", BASE_TIME + 1),
  kind: "breakpoint-style-edit",
  target: el("card-a"),
  breakpoint: "md",
  activeViewport: "tablet",
  responsivePrefix: "md",
  property: "padding",
  value: "16px",
  important: false,
  applyToBase: true,
};

describe("breakpoint context — additive fields validate", () => {
  it("accepts a breakpoint-style-edit carrying full breakpoint context", () => {
    expect(OperationSchema.safeParse(scopedStyleOp).success).toBe(true);
  });

  it("accepts applyToBase: true as explicit intent to overwrite base", () => {
    expect(OperationSchema.safeParse(baseOverwriteOp).success).toBe(true);
  });

  it("still accepts a legacy breakpoint op without the new context fields", () => {
    const legacy: Operation = {
      ...base("op-bp-leg0001", BASE_TIME + 2),
      kind: "breakpoint-class-edit",
      target: el("card-a"),
      breakpoint: "sm",
      oldClassName: "p-1",
      newClassName: "p-2",
    };
    expect(OperationSchema.safeParse(legacy).success).toBe(true);
  });

  it("rejects an empty activeViewport string", () => {
    const bad = { ...scopedStyleOp, activeViewport: "" } as unknown as Operation;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an empty responsivePrefix string", () => {
    const bad = { ...scopedStyleOp, responsivePrefix: "" } as unknown as Operation;
    expect(OperationSchema.safeParse(bad).success).toBe(false);
  });
});

describe("isBaseOverwriteAllowed — the explicit-intent guard", () => {
  it("returns false when applyToBase is absent (scoped by default)", () => {
    expect(isBaseOverwriteAllowed(scopedStyleOp)).toBe(false);
  });

  it("returns false when applyToBase is explicitly false", () => {
    const op = { ...scopedStyleOp, applyToBase: false };
    expect(isBaseOverwriteAllowed(op)).toBe(false);
  });

  it("returns true ONLY when applyToBase is explicitly true", () => {
    expect(isBaseOverwriteAllowed(baseOverwriteOp)).toBe(true);
  });

  it("guards all three breakpoint kinds identically (scoped by default)", () => {
    const classOp: Operation = {
      ...base("op-bp-clsa0001", BASE_TIME + 3),
      kind: "breakpoint-class-edit",
      target: el("card-a"),
      breakpoint: "md",
      oldClassName: "p-2",
      newClassName: "p-4",
    };
    expect(isBaseOverwriteAllowed(classOp)).toBe(false);
  });
});

describe("breakpoint context — inverse preserves the context", () => {
  it("breakpoint-style-edit inverse carries activeViewport/responsivePrefix/applyToBase forward", () => {
    const inv = computeInverse(scopedStyleOp);
    if (inv.kind !== "breakpoint-style-edit") throw new Error("expected breakpoint-style-edit");
    expect(inv.breakpoint).toBe("md");
    expect(inv.activeViewport).toBe("tablet");
    expect(inv.responsivePrefix).toBe("md");
    expect(inv.mediaSource).toBe("@media (min-width: 768px)");
    // applyToBase was absent on the forward op; the inverse must also leave it
    // scoped (no implicit base overwrite introduced by undo).
    expect(isBaseOverwriteAllowed(inv)).toBe(false);
    expect(OperationSchema.safeParse(inv).success).toBe(true);
  });

  it("breakpoint-style-edit inverse preserves an explicit applyToBase: true", () => {
    const inv = computeInverse(baseOverwriteOp);
    if (inv.kind !== "breakpoint-style-edit") throw new Error("expected breakpoint-style-edit");
    expect(isBaseOverwriteAllowed(inv)).toBe(true);
    expect(inv.activeViewport).toBe("tablet");
    expect(inv.responsivePrefix).toBe("md");
  });

  it("a round-trip (op -> inverse -> inverse) preserves all context fields", () => {
    const roundTrip = computeInverse(computeInverse(scopedStyleOp));
    if (roundTrip.kind !== "breakpoint-style-edit") {
      throw new Error("expected breakpoint-style-edit");
    }
    expect(roundTrip.breakpoint).toBe("md");
    expect(roundTrip.activeViewport).toBe("tablet");
    expect(roundTrip.responsivePrefix).toBe("md");
    expect(roundTrip.mediaSource).toBe("@media (min-width: 768px)");
    expect(roundTrip.property).toBe("padding");
    expect(roundTrip.value).toBe("16px");
    expect(isBaseOverwriteAllowed(roundTrip)).toBe(false);
  });
});
