import { computeInverse, OperationSchema } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";

import { UnsupportedLayoutError } from "./command-errors.js";
import { createPositionCommand } from "./position-command.js";

const timestamp = 1234567890123;
const ref = (id: string) => ({ runtimeId: id });

const normalFlowContext = {
  currentRole: "normal-flow-block" as const,
  hasPositionedAncestor: false,
  currentPosition: "static",
};

const positionedContext = {
  currentRole: "absolute-positioned" as const,
  hasPositionedAncestor: true,
  currentPosition: "absolute",
};

describe("createPositionCommand — D41 normal-flow guard (PRD §9.2.C / Appendix D.2)", () => {
  it("rejects absolute positioning on a normal-flow element without opt-in", () => {
    expect(() =>
      createPositionCommand({
        target: ref("el-1"),
        positioning: "absolute",
        context: normalFlowContext,
      }),
    ).toThrowError(UnsupportedLayoutError);
  });

  it("rejects fixed positioning on a normal-flow element without opt-in", () => {
    const err = (() => {
      try {
        createPositionCommand({
          target: ref("el-1"),
          positioning: "fixed",
          context: { ...normalFlowContext, currentRole: "inline" },
        });
        return null;
      } catch (error) {
        return error as UnsupportedLayoutError;
      }
    })();

    expect(err).not.toBeNull();
    expect(err?.code).toBe("UNSUPPORTED_LAYOUT");
    expect(err?.name).toBe("UnsupportedLayoutError");
  });

  it("succeeds on an already-positioned element (existing positioned context)", () => {
    const op = createPositionCommand(
      { target: ref("el-1"), positioning: "absolute", context: positionedContext },
      { id: "op-pos-0001", timestamp },
    );

    expect(op.kind).toBe("position-element");
    expect(op.fromValue).toBe("absolute");
    expect(op.toValue).toBe("absolute");
    expect(OperationSchema.safeParse(op).success).toBe(true);
  });

  it("succeeds on a normal-flow element WITH a positioned ancestor", () => {
    const op = createPositionCommand({
      target: ref("el-1"),
      positioning: "absolute",
      containingBlock: ref("ancestor-1"),
      context: { ...normalFlowContext, hasPositionedAncestor: true },
    });

    expect(op.kind).toBe("position-element");
    expect(op.toValue).toBe("absolute");
  });

  it("succeeds on a normal-flow element WITH explicit user intent", () => {
    const op = createPositionCommand({
      target: ref("el-1"),
      positioning: "fixed",
      context: normalFlowContext,
      explicitUserIntent: true,
    });

    expect(op.kind).toBe("position-element");
    expect(op.toValue).toBe("fixed");
  });

  it("relative-offset is in-flow and bypasses the absolute guard", () => {
    const op = createPositionCommand({
      target: ref("el-1"),
      positioning: "relative-offset",
      context: normalFlowContext,
    });

    expect(op.kind).toBe("position-element");
    expect(op.toValue).toBe("relative");
  });

  it("transform mode is unsupported in MVP scope", () => {
    expect(() =>
      createPositionCommand({
        target: ref("el-1"),
        positioning: "transform",
        context: positionedContext,
      }),
    ).toThrowError(UnsupportedLayoutError);
  });
});

describe("createPositionCommand — inverse round-trip", () => {
  it("undo swaps from/to position values", () => {
    const op = createPositionCommand(
      { target: ref("el-1"), positioning: "absolute", context: positionedContext },
      { id: "op-pos-0002", timestamp },
    );

    const inverse = computeInverse(op);
    expect(inverse.kind).toBe("position-element");
    if (inverse.kind !== "position-element") throw new Error("expected position-element inverse");
    expect(inverse.fromValue).toBe(op.toValue);
    expect(inverse.toValue).toBe(op.fromValue);
    expect(OperationSchema.safeParse(inverse).success).toBe(true);
  });
});

describe("createPositionCommand — adversarial D41 guard", () => {
  /**
   * PRD Appendix D.2 constraint 2 (binding, Metis D41): a normal-flow drag MUST
   * NOT collapse into a position-element intent. This test sweeps every
   * normal-flow role, every out-of-flow positioning, and every "no positioned
   * ancestor / no explicit intent" combination, asserting NONE can produce a
   * position-element op. The factory is the only seam that builds this op, so a
   * throw here is proof the intent is never emitted.
   */
  const normalFlowRoles = [
    "normal-flow-block",
    "inline",
    "inline-block",
    "flex-container",
    "flex-item",
    "grid-container",
    "grid-item",
    "replaced-element",
    "svg-element",
  ] as const;
  const outOfFlowPositioning = ["absolute", "fixed"] as const;

  for (const role of normalFlowRoles) {
    for (const positioning of outOfFlowPositioning) {
      it(`never emits a position-element intent for ${role} → ${positioning} (no opt-in)`, () => {
        let produced = null;
        try {
          produced = createPositionCommand({
            target: ref("el-1"),
            positioning,
            context: { currentRole: role, hasPositionedAncestor: false, currentPosition: "static" },
          });
        } catch (error) {
          expect(error).toBeInstanceOf(UnsupportedLayoutError);
          expect((error as UnsupportedLayoutError).code).toBe("UNSUPPORTED_LAYOUT");
        }
        expect(produced).toBeNull();
      });
    }
  }

  it("a normal-flow drag with no ancestor still resolves to absolute WHEN explicitly opted in", () => {
    // The escape hatch: the user explicitly chooses free-position. This is the
    // ONLY path a normal-flow element reaches absolute via this factory.
    const op = createPositionCommand({
      target: ref("el-1"),
      positioning: "absolute",
      context: normalFlowContext,
      explicitUserIntent: true,
    });
    expect(op.toValue).toBe("absolute");
  });
});
