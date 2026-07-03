import type { LayoutRole } from "./layout-role.js";

/**
 * The user's explicit opt-in for free-move within a positioned context. Only
 * `"free-move"` is recognized: a group free-move in a positioned (absolute/
 * fixed) context is allowed ONLY when this flag is present. Absent for ordinary
 * in-flow drags (which resolve to reorder/reparent).
 */
export type GroupFreeMoveIntent = "free-move";

/**
 * Pure, DOM-free input to {@link classifyGroupMove}. Mirrors {@link SemanticInput}
 * but adds the group-specific `userIntent` (the free-move opt-in) and
 * `ownershipRisk` (a member's source-origin differs from the target parent's
 * source-origin).
 *
 * The caller (a browser controller) supplies the classified layout roles and
 * position flags; this module never reads `getComputedStyle`.
 */
export interface GroupMoveInput {
  /** True when every group member shares the same parent element. */
  readonly sameParent: boolean;
  readonly sourceParentRole: LayoutRole;
  readonly targetParentRole: LayoutRole;
  /** Content-model validity of the dragged members under the target parent. */
  readonly validContentModel: boolean;
  /** Source parent is out-of-flow (absolute/fixed). */
  readonly sourceContextPositioned?: boolean;
  /** Target parent is out-of-flow (absolute/fixed). */
  readonly targetContextPositioned?: boolean;
  /** Explicit user opt-in for a positioned-context free-move. */
  readonly userIntent?: GroupFreeMoveIntent;
  /** A member's source-origin differs from the new parent's source-origin. */
  readonly ownershipRisk?: boolean;
}

/**
 * Semantic candidate for a group move. The `kind` values align with the
 * `@vision-control/change-ir` operation discriminators so a candidate maps
 * directly onto an operation:
 *
 * - `group-reorder` → {@link GroupReorderOperation} (same-parent sibling reorder).
 * - `group-reparent` → {@link GroupReparentOperation} (cross-parent, with an
 *   ownership-risk warning when source-origins differ).
 * - `positioned-free-move` → per-member style-edit operations carrying an
 *   explicit `userIntent: "free-move"` flag.
 * - `unsupported-group-free-move` → DIAGNOSTIC. A normal-flow free-move attempt
 *   is rejected (PRD constraint 2 / MVP D41); the message NEVER instructs
 *   setting `position: absolute`.
 * - `unsupported-group-grid` → grid group-move is out of V1 scope (task 9).
 */
export type GroupMoveCandidate =
  | { readonly kind: "group-reorder"; readonly confidence: number }
  | {
      readonly kind: "group-reparent";
      readonly confidence: number;
      readonly validContentModel: boolean;
      readonly ownershipRisk: boolean;
      readonly warning: string | null;
    }
  | {
      readonly kind: "positioned-free-move";
      readonly confidence: number;
      readonly userIntent: "free-move";
    }
  | { readonly kind: "unsupported-group-free-move"; readonly message: string }
  | { readonly kind: "unsupported-group-grid"; readonly message: string };

const isGridRole = (role: LayoutRole): boolean => role === "grid";

const FREE_MOVE_REJECT_MESSAGE =
  "group free-move in normal flow is unsupported; drag kept as a diagnostic, not applied";

const FREE_MOVE_OPT_IN_MESSAGE =
  "positioned-context group free-move requires explicit user intent (free-move opt-in)";

/**
 * Classify a group-move gesture's semantic intent (PRD constraint 2 / V1
 * section 9.3). Decision order:
 *
 * 1. grid context (either parent) → `unsupported-group-grid` (task 9 scope).
 * 2. explicit free-move intent:
 *    - both contexts positioned → `positioned-free-move` (allowed, opt-in).
 *    - otherwise → `unsupported-group-free-move` (REJECTED — a normal-flow
 *      free-move never collapses to absolute positioning, per D41).
 * 3. no free-move intent, positioned context → `unsupported-group-free-move`
 *    (positioned free-move needs explicit opt-in).
 * 4. normal-flow same-parent → `group-reorder` (always allowed).
 * 5. normal-flow cross-parent → `group-reparent` (ownership-risk warning when
 *    member source-origins differ from the target parent).
 *
 * The result kinds align with change-ir discriminators so the interaction
 * machine can build the matching operation directly.
 */
export const classifyGroupMove = (input: GroupMoveInput): GroupMoveCandidate => {
  if (isGridRole(input.sourceParentRole) || isGridRole(input.targetParentRole)) {
    return {
      kind: "unsupported-group-grid",
      message: "group move in a grid context is not supported in V1 (see task 9)",
    };
  }

  if (input.userIntent === "free-move") {
    if (input.sourceContextPositioned === true && input.targetContextPositioned === true) {
      return { kind: "positioned-free-move", confidence: 0.85, userIntent: "free-move" };
    }
    return { kind: "unsupported-group-free-move", message: FREE_MOVE_REJECT_MESSAGE };
  }

  if (input.sourceContextPositioned === true || input.targetContextPositioned === true) {
    return { kind: "unsupported-group-free-move", message: FREE_MOVE_OPT_IN_MESSAGE };
  }

  if (input.sameParent) {
    return { kind: "group-reorder", confidence: 0.95 };
  }

  const ownershipRisk = input.ownershipRisk === true;
  return {
    kind: "group-reparent",
    confidence: input.validContentModel ? (ownershipRisk ? 0.6 : 0.9) : 0.4,
    validContentModel: input.validContentModel,
    ownershipRisk,
    warning: ownershipRisk
      ? "Ownership risk: one or more members originate from a different source module than the target parent"
      : null,
  };
};
