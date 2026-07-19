import { convertUsedSizeToFlexBasis } from "./box-sizing.js";
import type { FlexDiagnostic } from "./diagnostics.js";
import { computeLegalDeltaInterval } from "./legal-delta.js";
import type {
  FlexSizingMemberInput,
  PairedFlexMemberCandidate,
  PairedFlexResizeCandidate,
  PairedFlexResizePlan,
  PairedFlexValidationInput,
  PairedFlexValidationResult,
} from "./sizing-types.js";

const memberCandidate = (
  input: FlexSizingMemberInput,
  afterBorderBoxMainSize: number,
): PairedFlexMemberCandidate | FlexDiagnostic => {
  const basis = convertUsedSizeToFlexBasis({
    desiredBorderBoxMainSize: afterBorderBoxMainSize,
    box: input.box,
  });
  if (!basis.ok) return basis.diagnostic;
  return {
    beforeBorderBoxMainSize: input.beforeBorderBoxMainSize,
    afterBorderBoxMainSize,
    afterFlex: { flexGrow: 0, flexShrink: 0, flexBasisPixels: basis.basisPixels },
  };
};

const isDiagnostic = (value: PairedFlexMemberCandidate | FlexDiagnostic): value is FlexDiagnostic =>
  "code" in value;

export const planPairedFlexResize = (input: {
  readonly requestedDelta: number;
  readonly primary: FlexSizingMemberInput;
  readonly neighbor: FlexSizingMemberInput;
}): PairedFlexResizePlan => {
  if (!Number.isFinite(input.requestedDelta)) {
    return {
      kind: "rejected",
      diagnostic: { code: "invalid_constraints", member: null, message: "delta must be finite" },
    };
  }
  const legal = computeLegalDeltaInterval(input);
  if (!legal.ok) return { kind: "rejected", diagnostic: legal.diagnostic };
  if (
    input.requestedDelta < legal.interval.minimum ||
    input.requestedDelta > legal.interval.maximum
  ) {
    return {
      kind: "rejected",
      diagnostic: {
        code: "min_max_clamp",
        requestedDelta: input.requestedDelta,
        interval: legal.interval,
        message: "requested delta would be clamped by member constraints",
      },
    };
  }
  const primary = memberCandidate(
    input.primary,
    input.primary.beforeBorderBoxMainSize + input.requestedDelta,
  );
  if (isDiagnostic(primary)) return { kind: "rejected", diagnostic: primary };
  const neighbor = memberCandidate(
    input.neighbor,
    input.neighbor.beforeBorderBoxMainSize - input.requestedDelta,
  );
  if (isDiagnostic(neighbor)) return { kind: "rejected", diagnostic: neighbor };
  const candidate: PairedFlexResizeCandidate = {
    requestedDelta: input.requestedDelta,
    primary,
    neighbor,
    beforePairTotal: input.primary.beforeBorderBoxMainSize + input.neighbor.beforeBorderBoxMainSize,
    afterPairTotal: primary.afterBorderBoxMainSize + neighbor.afterBorderBoxMainSize,
  };
  return legal.requirements.length === 0
    ? { kind: "accepted", candidate, interval: legal.interval }
    : {
        kind: "validation-required",
        candidate,
        interval: legal.interval,
        requirements: legal.requirements,
      };
};

export const validatePairedFlexResize = (
  input: PairedFlexValidationInput,
): PairedFlexValidationResult => {
  const toleranceIsValid = Number.isFinite(input.tolerance) && input.tolerance >= 0;
  const primaryMatches =
    Number.isFinite(input.observed.primaryBorderBoxMainSize) &&
    Math.abs(
      input.observed.primaryBorderBoxMainSize - input.candidate.primary.afterBorderBoxMainSize,
    ) <= input.tolerance;
  const neighborMatches =
    Number.isFinite(input.observed.neighborBorderBoxMainSize) &&
    Math.abs(
      input.observed.neighborBorderBoxMainSize - input.candidate.neighbor.afterBorderBoxMainSize,
    ) <= input.tolerance;
  if (toleranceIsValid && primaryMatches && neighborMatches) {
    return { kind: "accepted", candidate: input.candidate };
  }
  return {
    kind: "rejected",
    diagnostic: {
      code: "intrinsic_validation_failed",
      message: "post-layout member sizes do not match the exact planned targets",
    },
  };
};
