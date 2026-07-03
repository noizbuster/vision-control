import { GRID_AWARE_FLOW_POINTER } from "./grid/index.js";
import { isGridRole, type LayoutRole } from "./layout-role.js";

/**
 * Classify the semantic intent of a drag from one location to another (PRD
 * section 9.3 / constraint 2). The result kinds align with
 * `@vision-control/change-ir` operation discriminators (`reorder-child`,
 * `reparent-element`) so a classified intent maps directly onto an operation.
 *
 * PRD constraint 2 (MUST NOT): a drag inside normal document flow MUST NOT
 * collapse to a `position: absolute` source intent. This module therefore
 * returns `reorder-child` / `reparent-element` for in-flow drags and only ever
 * returns `unsupported-free-move` as a DIAGNOSTIC for an already-positioned or
 * transformed context — never as an instruction to set `position: absolute`.
 */
export interface SemanticInput {
  /** True when the source and target parent are the same element. */
  readonly sameParent: boolean;
  readonly sourceParentRole: LayoutRole;
  readonly targetParentRole: LayoutRole;
  /** Result of {@link validateReparent} for the target parent/child pair. */
  readonly validContentModel: boolean;
  /** Source parent is out-of-flow (absolute/fixed) or sticky/transformed. */
  readonly sourceContextPositioned?: boolean;
  /** Target parent is out-of-flow (absolute/fixed) or sticky/transformed. */
  readonly targetContextPositioned?: boolean;
}

export type SemanticIntent =
  | { readonly kind: "reorder-child"; readonly confidence: number }
  | {
      readonly kind: "reparent-element";
      readonly confidence: number;
      readonly validContentModel: boolean;
    }
  | { readonly kind: "unsupported-free-move"; readonly message: string }
  | { readonly kind: "unsupported-grid"; readonly message: string };

const isGridParentRole = (role: LayoutRole): boolean => isGridRole(role);

/**
 * Classify a drag's semantic intent. Decision order:
 * 1. grid context (either parent) → `unsupported-grid` — a DIAGNOSTIC that now
 *    forwards to the V1 grid-aware flow (`./grid/`) instead of a hard "not
 *    supported" block. The kind stays `unsupported-grid` so the single-element
 *    classifier and its callers keep their exhaustive handling; the message
 *    points to cell inference + the DOM-order-vs-grid-area choice.
 * 2. positioned/transformed free-move context (either parent) →
 *    `unsupported-free-move` (DIAGNOSTIC, not an absolute-position intent).
 * 3. same parent, in flow → `reorder-child`.
 * 4. different parent, in flow → `reparent-element` (confidence reflects
 *    content-model validity).
 */
export const classifySemanticIntent = (input: SemanticInput): SemanticIntent => {
  if (isGridParentRole(input.sourceParentRole) || isGridParentRole(input.targetParentRole)) {
    return {
      kind: "unsupported-grid",
      message: GRID_AWARE_FLOW_POINTER,
    };
  }

  if (input.sourceContextPositioned === true || input.targetContextPositioned === true) {
    return {
      kind: "unsupported-free-move",
      message: "free positioning is out of MVP scope; drag kept as a diagnostic, not applied",
    };
  }

  if (input.sameParent) {
    return { kind: "reorder-child", confidence: 0.95 };
  }

  return {
    kind: "reparent-element",
    confidence: input.validContentModel ? 0.9 : 0.4,
    validContentModel: input.validContentModel,
  };
};
