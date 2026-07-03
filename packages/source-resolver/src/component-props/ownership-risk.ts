/**
 * Source ownership risk for component prop edits (VC-V1V2-21).
 *
 * When a user edits a component prop, the source ownership of that prop may or
 * may not be stable. This module assesses the risk:
 *
 * - `same-component` — the prop is on a component in its original location.
 *   HIGH risk that a deterministic edit is correct (but the risk is HIGH that
 *   we OWN the site, not that the edit is risky).
 * - `reparented-or-moved` — the component has been reparented or moved. The
 *   source ownership may have changed. MEDIUM risk.
 * - `cross-boundary` — the prop crosses a server/client/provider boundary
 *   (e.g. a Server Component passing a prop to a Client Component, or a
 *   context provider). LOW risk with an explicit warning.
 *
 * Note: the risk levels mirror `SourceCandidate.ownershipRisk`
 * ("none" | "low" | "medium" | "high") but here the semantics are
 * prop-ownership-specific.
 */

import type { DiscoveredProp } from "./prop-discovery.js";

/** Where the component lives relative to its original source ownership. */
export type OwnershipContext = "same-component" | "reparented-or-moved" | "cross-boundary";

/** The kind of boundary that is crossed (when context is `cross-boundary`). */
export type BoundaryKind = "server-to-client" | "client-to-server" | "context-provider" | "none";

/**
 * Risk assessment result for a component prop edit.
 *
 * The `risk` field uses the same enum as `SourceCandidate.ownershipRisk` so it
 * flows naturally into the existing confidence taxonomy.
 */
export interface PropOwnershipRisk {
  readonly context: OwnershipContext;
  readonly boundary: BoundaryKind;
  readonly risk: "high" | "medium" | "low";
  readonly reason: string;
  /**
   * True when a deterministic suggestion is safe to emit for this prop.
   * False means the caller MUST surface an agent-required warning.
   */
  readonly deterministicSafe: boolean;
}

/** Input for risk assessment. */
export interface OwnershipRiskInput {
  readonly prop: DiscoveredProp;
  readonly context: OwnershipContext;
  readonly boundary?: BoundaryKind;
  /** When true, the caller has explicitly opted in to crossing the boundary. */
  readonly boundaryOptIn?: boolean;
}

/**
 * Assess the source ownership risk for a component prop edit.
 *
 * Same-component literal props are deterministic-safe at HIGH risk.
 * Reparented/moved props are deterministic-safe at MEDIUM with a warning.
 * Cross-boundary props without opt-in are NOT deterministic-safe (agent-required).
 */
export const assessOwnershipRisk = (input: OwnershipRiskInput): PropOwnershipRisk => {
  const boundary = input.boundary ?? defaultBoundaryFor(input.context);

  if (input.context === "cross-boundary") {
    if (input.boundaryOptIn === true) {
      return {
        context: input.context,
        boundary,
        risk: "medium",
        reason: crossBoundaryOptInReason(boundary),
        deterministicSafe: true,
      };
    }
    return {
      context: input.context,
      boundary,
      risk: "low",
      reason: crossBoundaryWarning(boundary),
      deterministicSafe: false,
    };
  }

  if (input.context === "reparented-or-moved") {
    return {
      context: input.context,
      boundary,
      risk: "medium",
      reason:
        "component has been reparented or moved; source ownership may have changed — verify the edit site is still correct",
      deterministicSafe: true,
    };
  }

  return {
    context: "same-component",
    boundary: "none",
    risk: "high",
    reason: "prop is on a component in its original location — source ownership is stable",
    deterministicSafe: true,
  };
};

const defaultBoundaryFor = (context: OwnershipContext): BoundaryKind => {
  if (context === "cross-boundary") return "context-provider";
  return "none";
};

const crossBoundaryWarning = (boundary: BoundaryKind): string => {
  switch (boundary) {
    case "server-to-client":
      return "prop crosses a Server Component → Client Component boundary; server/client prop serialization rules apply — agent must verify the edit does not break serialization";
    case "client-to-server":
      return "prop crosses a Client Component → Server Component boundary; this is rarely valid — agent must verify the intent";
    case "context-provider":
      return "prop flows through a Context Provider; changing it may affect all consumers — agent must verify the blast radius";
    default:
      return "prop crosses a framework boundary — agent must verify the edit is safe across the boundary";
  }
};

const crossBoundaryOptInReason = (boundary: BoundaryKind): string => {
  switch (boundary) {
    case "server-to-client":
      return "boundary crossing opted in; server-to-client prop edit is deterministic but verify serialization compatibility";
    case "client-to-server":
      return "boundary crossing opted in; client-to-server prop edit is unusual — verify the intent";
    case "context-provider":
      return "boundary crossing opted in; context-provider prop edit may affect all consumers — verify blast radius";
    default:
      return "boundary crossing opted in";
  }
};
