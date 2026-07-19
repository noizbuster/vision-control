import { convertConstraintToBorderBox } from "./box-sizing.js";
import type { DeltaInterval, FlexDiagnostic } from "./diagnostics.js";
import type {
  FlexMemberRole,
  FlexSizingMemberInput,
  FlexValidationRequirement,
  LegalDeltaIntervalResult,
} from "./sizing-types.js";

type ResolvedBounds = {
  readonly ok: true;
  readonly minimum: number;
  readonly maximum: number;
  readonly requirements: readonly FlexValidationRequirement[];
};

type RejectedBounds = { readonly ok: false; readonly diagnostic: FlexDiagnostic };

const invalidConstraints = (member: FlexMemberRole, message: string): FlexDiagnostic => ({
  code: "invalid_constraints",
  member,
  message,
});

const assignConstraintMember = (
  diagnostic: FlexDiagnostic,
  member: FlexMemberRole,
): FlexDiagnostic =>
  diagnostic.code === "invalid_constraints" ? { ...diagnostic, member } : diagnostic;

const resolveBounds = (
  member: FlexMemberRole,
  input: FlexSizingMemberInput,
): ResolvedBounds | RejectedBounds => {
  if (!Number.isFinite(input.beforeBorderBoxMainSize) || input.beforeBorderBoxMainSize < 0) {
    return {
      ok: false,
      diagnostic: invalidConstraints(member, "before size must be non-negative"),
    };
  }
  const min = convertConstraintToBorderBox({ constraint: input.min, bound: "min", box: input.box });
  const max = convertConstraintToBorderBox({ constraint: input.max, bound: "max", box: input.box });
  if (min.kind === "rejected") {
    return { ok: false, diagnostic: assignConstraintMember(min.diagnostic, member) };
  }
  if (max.kind === "rejected") {
    return { ok: false, diagnostic: assignConstraintMember(max.diagnostic, member) };
  }
  if (min.kind === "unbounded") {
    return { ok: false, diagnostic: invalidConstraints(member, "minimum cannot be unbounded") };
  }
  const minimum = min.kind === "resolved" ? min.borderBoxPixels : 0;
  const maximum = max.kind === "resolved" ? max.borderBoxPixels : Number.POSITIVE_INFINITY;
  if (minimum > maximum) {
    return { ok: false, diagnostic: invalidConstraints(member, "minimum exceeds maximum") };
  }
  const requirements: FlexValidationRequirement[] = [];
  if (min.kind === "validation-required") {
    requirements.push({ member, bound: min.bound, keyword: min.keyword });
  }
  if (max.kind === "validation-required") {
    requirements.push({ member, bound: max.bound, keyword: max.keyword });
  }
  return { ok: true, minimum, maximum, requirements };
};

export const computeLegalDeltaInterval = (input: {
  readonly primary: FlexSizingMemberInput;
  readonly neighbor: FlexSizingMemberInput;
}): LegalDeltaIntervalResult => {
  const primary = resolveBounds("primary", input.primary);
  if (!primary.ok) return primary;
  const neighbor = resolveBounds("neighbor", input.neighbor);
  if (!neighbor.ok) return neighbor;
  const interval: DeltaInterval = {
    minimum: Math.max(
      primary.minimum - input.primary.beforeBorderBoxMainSize,
      input.neighbor.beforeBorderBoxMainSize - neighbor.maximum,
    ),
    maximum: Math.min(
      primary.maximum - input.primary.beforeBorderBoxMainSize,
      input.neighbor.beforeBorderBoxMainSize - neighbor.minimum,
    ),
  };
  if (interval.minimum > interval.maximum) {
    return {
      ok: false,
      diagnostic: {
        code: "min_max_clamp",
        requestedDelta: null,
        interval,
        message: "member constraints have no shared legal delta",
      },
    };
  }
  return {
    ok: true,
    interval,
    requirements: [...primary.requirements, ...neighbor.requirements],
  };
};
