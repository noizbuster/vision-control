import type { DeltaInterval, FlexDiagnostic } from "./diagnostics.js";

export type BoxSizing = "content-box" | "border-box";
export type ConstraintBound = "min" | "max";
export type FlexMemberRole = "primary" | "neighbor";

export interface FlexBoxMetrics {
  readonly boxSizing: BoxSizing;
  readonly paddingMainStart: number;
  readonly paddingMainEnd: number;
  readonly borderMainStart: number;
  readonly borderMainEnd: number;
}

export type FlexSizeConstraint =
  | { readonly kind: "numeric"; readonly value: number }
  | { readonly kind: "keyword"; readonly value: string }
  | { readonly kind: "none" };

export interface FlexSizingMemberInput {
  readonly beforeBorderBoxMainSize: number;
  readonly box: FlexBoxMetrics;
  readonly min: FlexSizeConstraint;
  readonly max: FlexSizeConstraint;
}

export type ConstraintConversionResult =
  | { readonly kind: "resolved"; readonly borderBoxPixels: number }
  | { readonly kind: "unbounded" }
  | {
      readonly kind: "validation-required";
      readonly keyword: string;
      readonly bound: ConstraintBound;
    }
  | { readonly kind: "rejected"; readonly diagnostic: FlexDiagnostic };

export interface FlexValidationRequirement {
  readonly member: FlexMemberRole;
  readonly bound: ConstraintBound;
  readonly keyword: string;
}

export type LegalDeltaIntervalResult =
  | {
      readonly ok: true;
      readonly interval: DeltaInterval;
      readonly requirements: readonly FlexValidationRequirement[];
    }
  | { readonly ok: false; readonly diagnostic: FlexDiagnostic };

export interface FrozenFlexState {
  readonly flexGrow: 0;
  readonly flexShrink: 0;
  readonly flexBasisPixels: number;
}

export interface PairedFlexMemberCandidate {
  readonly beforeBorderBoxMainSize: number;
  readonly afterBorderBoxMainSize: number;
  readonly afterFlex: FrozenFlexState;
}

export interface PairedFlexResizeCandidate {
  readonly requestedDelta: number;
  readonly primary: PairedFlexMemberCandidate;
  readonly neighbor: PairedFlexMemberCandidate;
  readonly beforePairTotal: number;
  readonly afterPairTotal: number;
}

export type PairedFlexResizePlan =
  | {
      readonly kind: "accepted";
      readonly candidate: PairedFlexResizeCandidate;
      readonly interval: DeltaInterval;
    }
  | {
      readonly kind: "validation-required";
      readonly candidate: PairedFlexResizeCandidate;
      readonly interval: DeltaInterval;
      readonly requirements: readonly FlexValidationRequirement[];
    }
  | { readonly kind: "rejected"; readonly diagnostic: FlexDiagnostic };

export interface PairedFlexValidationInput {
  readonly candidate: PairedFlexResizeCandidate;
  readonly observed: {
    readonly primaryBorderBoxMainSize: number;
    readonly neighborBorderBoxMainSize: number;
  };
  readonly tolerance: number;
}

export type PairedFlexValidationResult =
  | { readonly kind: "accepted"; readonly candidate: PairedFlexResizeCandidate }
  | { readonly kind: "rejected"; readonly diagnostic: FlexDiagnostic };
