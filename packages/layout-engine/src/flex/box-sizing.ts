import type { FlexDiagnostic } from "./diagnostics.js";
import type {
  ConstraintBound,
  ConstraintConversionResult,
  FlexBoxMetrics,
  FlexSizeConstraint,
} from "./sizing-types.js";

class UnreachableConstraintError extends Error {
  override readonly name = "UnreachableConstraintError";
  constructor() {
    super("unreachable flex size constraint variant");
  }
}

const assertNever = (_value: never): never => {
  throw new UnreachableConstraintError();
};

const edgeTotal = (box: FlexBoxMetrics): number =>
  box.paddingMainStart + box.paddingMainEnd + box.borderMainStart + box.borderMainEnd;

const validBox = (box: FlexBoxMetrics): boolean =>
  [box.paddingMainStart, box.paddingMainEnd, box.borderMainStart, box.borderMainEnd].every(
    (value) => Number.isFinite(value) && value >= 0,
  );

const invalidConstraints = (message: string): FlexDiagnostic => ({
  code: "invalid_constraints",
  member: null,
  message,
});

export type FlexBasisConversionResult =
  | { readonly ok: true; readonly basisPixels: number }
  | { readonly ok: false; readonly diagnostic: FlexDiagnostic };

export const convertUsedSizeToFlexBasis = (input: {
  readonly desiredBorderBoxMainSize: number;
  readonly box: FlexBoxMetrics;
}): FlexBasisConversionResult => {
  if (!validBox(input.box) || !Number.isFinite(input.desiredBorderBoxMainSize)) {
    return {
      ok: false,
      diagnostic: { code: "invalid_box", domIndex: null, message: "box metrics must be finite" },
    };
  }
  const basisPixels =
    input.box.boxSizing === "content-box"
      ? input.desiredBorderBoxMainSize - edgeTotal(input.box)
      : input.desiredBorderBoxMainSize;
  return basisPixels < 0
    ? {
        ok: false,
        diagnostic: invalidConstraints("desired border-box size cannot contain its box edges"),
      }
    : { ok: true, basisPixels };
};

export const convertConstraintToBorderBox = (input: {
  readonly constraint: FlexSizeConstraint;
  readonly bound: ConstraintBound;
  readonly box: FlexBoxMetrics;
}): ConstraintConversionResult => {
  if (!validBox(input.box)) {
    return {
      kind: "rejected",
      diagnostic: { code: "invalid_box", domIndex: null, message: "box metrics must be finite" },
    };
  }
  switch (input.constraint.kind) {
    case "numeric": {
      if (!Number.isFinite(input.constraint.value) || input.constraint.value < 0) {
        return {
          kind: "rejected",
          diagnostic: invalidConstraints(`${input.bound} constraint must be non-negative`),
        };
      }
      const borderBoxPixels =
        input.box.boxSizing === "content-box"
          ? input.constraint.value + edgeTotal(input.box)
          : input.constraint.value;
      return { kind: "resolved", borderBoxPixels };
    }
    case "none":
      return input.bound === "max"
        ? { kind: "unbounded" }
        : {
            kind: "rejected",
            diagnostic: invalidConstraints("none is valid only for a max constraint"),
          };
    case "keyword":
      return input.constraint.value.trim().length > 0
        ? { kind: "validation-required", keyword: input.constraint.value, bound: input.bound }
        : {
            kind: "rejected",
            diagnostic: invalidConstraints(`${input.bound} keyword must not be empty`),
          };
    default:
      return assertNever(input.constraint);
  }
};
