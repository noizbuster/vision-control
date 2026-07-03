/**
 * Component props editing with safe source ownership rules (VC-V1V2-21).
 *
 * Public surface for prop discovery, source-range mapping, candidate values,
 * ownership risk assessment, and prop-flow warnings. The convenience function
 * {@link buildComponentPropEditIntent} ties these together and bridges to the
 * suggested-diff generator.
 *
 * The load-bearing contracts:
 * - A safe static literal prop edit (`variant="secondary"` -> `variant="primary"`)
 *   produces a deterministic `StaticEditIntent` for the generator.
 * - A dynamic/computed prop (`variant={computeVariant(user)}`) produces no
 *   intent — the caller surfaces an agent-required signal.
 * - A cross-boundary prop without explicit opt-in produces a blocking warning.
 */

import type { ConfidenceEvidence } from "../confidence.js";
import type { SourceRange } from "../suggested-diff/diff-format.js";
import type { StaticEditIntent, SuggestionOwnership } from "../suggested-diff/generator.js";

import {
  type CandidateValue,
  type CandidateValuesResult,
  candidateValuesFor,
  inferTypeMetadata,
  isValidCandidate,
  type PropTypeMetadata,
  type PropValueType,
} from "./candidate-values.js";
import {
  assessOwnershipRisk,
  type BoundaryKind,
  type OwnershipContext,
  type OwnershipRiskInput,
  type PropOwnershipRisk,
} from "./ownership-risk.js";
import {
  type ComponentFramework,
  type DiscoveredProp,
  discoverProps,
  isLiteralProp,
  type PropDiscoveryInput,
  type PropDiscoveryResult,
  type PropValueKind,
} from "./prop-discovery.js";
import {
  hasBlockingWarning,
  type PropFlowWarning,
  type PropFlowWarningInput,
  type PropFlowWarningSeverity,
  propFlowWarnings,
} from "./prop-flow-warnings.js";
import {
  DETERMINISTIC_PROP_KINDS,
  DYNAMIC_PROP_KINDS,
  hasPropSourceRange,
  mapPropToSourceRange,
  type PropRangeOrigin,
  type PropSourceMapping,
} from "./source-range-mapping.js";

export {
  assessOwnershipRisk,
  type BoundaryKind,
  type CandidateValue,
  type CandidateValuesResult,
  type ComponentFramework,
  candidateValuesFor,
  DETERMINISTIC_PROP_KINDS,
  type DiscoveredProp,
  DYNAMIC_PROP_KINDS,
  discoverProps,
  hasBlockingWarning,
  hasPropSourceRange,
  inferTypeMetadata,
  isLiteralProp,
  isValidCandidate,
  mapPropToSourceRange,
  type OwnershipContext,
  type OwnershipRiskInput,
  type PropDiscoveryInput,
  type PropDiscoveryResult,
  type PropFlowWarning,
  type PropFlowWarningInput,
  type PropFlowWarningSeverity,
  type PropOwnershipRisk,
  type PropRangeOrigin,
  type PropSourceMapping,
  type PropTypeMetadata,
  type PropValueKind,
  type PropValueType,
  propFlowWarnings,
};

// ---------------------------------------------------------------------------
// Orchestration: bridge prop discovery to the suggested-diff generator
// ---------------------------------------------------------------------------

/** Input for building a component prop edit intent. */
export interface ComponentPropEditInput {
  readonly prop: DiscoveredProp;
  readonly desiredValue: string;
  readonly componentName: string;
  readonly filePath: string;
  readonly framework: ComponentFramework;
  readonly ownershipContext: OwnershipContext;
  readonly boundary?: BoundaryKind;
  readonly boundaryOptIn?: boolean;
  readonly typeMetadata?: PropTypeMetadata;
  /** Full source line before the edit (defaults to the prop's raw value). */
  readonly oldLine?: string;
  /** Full source line after the edit (defaults to the desired value). */
  readonly newLine?: string;
  readonly evidence?: readonly ConfidenceEvidence[];
}

/** Result of building a component prop edit intent. */
export type ComponentPropEditResult =
  | {
      readonly kind: "intent";
      readonly intent: StaticEditIntent;
      readonly risk: PropOwnershipRisk;
      readonly warnings: readonly PropFlowWarning[];
      readonly candidates: readonly CandidateValue[];
    }
  | {
      readonly kind: "agent-required";
      readonly reason: string;
      readonly warnings: readonly PropFlowWarning[];
    };

/**
 * Build a deterministic `StaticEditIntent` for a component prop edit, or return
 * an "agent-required" signal when the edit is not safely deterministic.
 *
 * This is the load-bearing orchestration: it checks prop literalness, source
 * range, ownership risk, prop-flow warnings, and candidate validity — then
 * produces a `StaticEditIntent` with `kind: "component-prop-edit"` for the
 * generator, or blocks with agent-required.
 */
export const buildComponentPropEdit = (input: ComponentPropEditInput): ComponentPropEditResult => {
  const warnings = propFlowWarnings({
    componentName: input.componentName,
    propName: input.prop.name,
    context: input.ownershipContext,
    ...(input.boundary !== undefined ? { boundary: input.boundary } : {}),
    ...(input.boundaryOptIn !== undefined ? { boundaryOptIn: input.boundaryOptIn } : {}),
  });

  if (hasBlockingWarning(warnings)) {
    const blocking = warnings.find((w) => w.severity === "error");
    return {
      kind: "agent-required",
      reason: blocking?.message ?? "cross-boundary prop edit without opt-in",
      warnings,
    };
  }

  if (!isLiteralProp(input.prop)) {
    return {
      kind: "agent-required",
      reason: `prop "${input.prop.name}" is dynamic (${input.prop.kind}); a deterministic edit is not possible — agent reasoning required`,
      warnings,
    };
  }

  const mapping = mapPropToSourceRange(input.prop, input.framework);
  if (!mapping.deterministic || mapping.range === undefined) {
    return {
      kind: "agent-required",
      reason: `prop "${input.prop.name}" has no deterministic source range; agent reasoning required`,
      warnings,
    };
  }

  const metadata = input.typeMetadata ?? inferTypeMetadata(input.prop);
  if (!isValidCandidate(input.desiredValue, metadata)) {
    return {
      kind: "agent-required",
      reason: `desired value "${input.desiredValue}" is not a valid candidate for prop "${input.prop.name}" (type: ${metadata.type}); agent reasoning required`,
      warnings,
    };
  }

  const risk = assessOwnershipRisk({
    prop: input.prop,
    context: input.ownershipContext,
    ...(input.boundary !== undefined ? { boundary: input.boundary } : {}),
    ...(input.boundaryOptIn !== undefined ? { boundaryOptIn: input.boundaryOptIn } : {}),
  });

  const candidates = candidateValuesFor(metadata).candidates;

  const intent = buildIntent(input, mapping.range, risk.risk);
  return {
    kind: "intent",
    intent,
    risk,
    warnings,
    candidates,
  };
};

const buildIntent = (
  input: ComponentPropEditInput,
  range: SourceRange,
  riskLevel: PropOwnershipRisk["risk"],
): StaticEditIntent => {
  const oldValue = formatLiteralValue(input.prop.literalValue);
  const ownership: SuggestionOwnership = riskLevel === "high" ? "unambiguous" : "text-backed";
  return {
    kind: "component-prop-edit",
    filePath: input.filePath,
    componentName: input.componentName,
    propName: input.prop.name,
    oldValue,
    newValue: input.desiredValue,
    ...(input.oldLine !== undefined ? { oldLine: input.oldLine } : {}),
    ...(input.newLine !== undefined ? { newLine: input.newLine } : {}),
    sourceRange: range,
    evidence: input.evidence ?? ["ast-origin"],
    ownership,
  };
};

const formatLiteralValue = (value: string | number | boolean | undefined): string => {
  if (value === undefined) return "";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  return value;
};
