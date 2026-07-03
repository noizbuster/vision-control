/**
 * Prop-flow warnings for reparented/moved components (VC-V1V2-21).
 *
 * When a component is reparented or moved, its prop flow may be affected: props
 * that were previously static may now be injected by a context provider, or a
 * server/client boundary may have been introduced. This module surfaces warnings
 * for those scenarios.
 *
 * Additionally, cross server/client/provider boundaries require explicit
 * warning before a deterministic suggestion is produced — the caller must opt in.
 */

import type { BoundaryKind, OwnershipContext } from "./ownership-risk.js";

/** Severity of a prop-flow warning. */
export type PropFlowWarningSeverity = "info" | "warning" | "error";

/** A prop-flow warning. */
export interface PropFlowWarning {
  readonly code: string;
  readonly message: string;
  readonly severity: PropFlowWarningSeverity;
  readonly context: OwnershipContext;
  readonly boundary: BoundaryKind;
}

/** Input for prop-flow warning generation. */
export interface PropFlowWarningInput {
  readonly componentName: string;
  readonly propName: string;
  readonly context: OwnershipContext;
  readonly boundary?: BoundaryKind;
  readonly boundaryOptIn?: boolean;
}

/**
 * Generate prop-flow warnings for a component prop edit scenario.
 *
 * Returns an array of warnings (may be empty when the context is safe).
 * Cross-boundary without opt-in ALWAYS produces at least one warning.
 */
export const propFlowWarnings = (input: PropFlowWarningInput): PropFlowWarning[] => {
  const warnings: PropFlowWarning[] = [];
  const boundary = input.boundary ?? "none";

  if (input.context === "reparented-or-moved") {
    warnings.push({
      code: "prop-flow-reparented",
      message: `Component "${input.componentName}" has been reparented or moved; prop "${input.propName}" may have a different source ownership than expected`,
      severity: "warning",
      context: input.context,
      boundary,
    });
  }

  if (input.context === "cross-boundary") {
    if (input.boundaryOptIn !== true) {
      warnings.push({
        code: "prop-flow-cross-boundary-no-opt-in",
        message: crossBoundaryMessage(input.componentName, input.propName, boundary),
        severity: "error",
        context: input.context,
        boundary,
      });
    } else {
      warnings.push({
        code: "prop-flow-cross-boundary-opted-in",
        message: `Component "${input.componentName}" prop "${input.propName}" crosses a ${boundaryLabel(boundary)} boundary (opted in); verify the edit does not break consumers`,
        severity: "info",
        context: input.context,
        boundary,
      });
    }
  }

  return warnings;
};

/**
 * Convenience: true when any prop-flow warning is blocking (severity "error").
 * When blocking, a deterministic suggestion must NOT be emitted.
 */
export const hasBlockingWarning = (warnings: readonly PropFlowWarning[]): boolean =>
  warnings.some((w) => w.severity === "error");

const crossBoundaryMessage = (
  componentName: string,
  propName: string,
  boundary: BoundaryKind,
): string => {
  const label = boundaryLabel(boundary);
  return `Component "${componentName}" prop "${propName}" crosses a ${label} boundary without explicit opt-in; a deterministic suggestion is blocked — agent reasoning required`;
};

const boundaryLabel = (boundary: BoundaryKind): string => {
  switch (boundary) {
    case "server-to-client":
      return "Server → Client";
    case "client-to-server":
      return "Client → Server";
    case "context-provider":
      return "Context Provider";
    default:
      return "framework";
  }
};
