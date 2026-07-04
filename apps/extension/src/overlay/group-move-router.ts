/**
 * Group-move router (plan task 3).
 *
 * Bridges the multi-select group (task 2) to the existing group-move methods
 * on the single-element controllers:
 * - same-parent drag → {@link ReorderController.reorderGroup} (records
 *   `group-reorder`; D41-guarded internally via `classifyGroupMove`).
 * - cross-parent drag → {@link ReparentController.reparentGroup} (records
 *   `group-reparent`; D41-guarded internally).
 *
 * The router is the ONLY caller that decides which controller path a group drag
 * takes. It does NOT duplicate `reorderGroup`/`reparentGroup`; it reuses them.
 * The classification step (`classifyGroupMove`) is the routing decision; the
 * controllers run their OWN `classifyGroupMove` guard as defense-in-depth (do
 * not remove those — task 1 / existing contract).
 *
 * PRD constraint 2 / D41 is enforced inside `classifyGroupMove`: a normal-flow
 * group free-move is rejected with a diagnostic whose message NEVER matches
 * `/position:\s*absolute/i`. The router surfaces that rejection unchanged.
 */

import type { GroupReorderOperation, GroupReparentOperation } from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { ElementRef } from "@vision-control/element-identity";
import {
  classifyGroupMove,
  type GroupFreeMoveIntent,
  type LayoutRole,
} from "@vision-control/layout-engine";

import type { ReparentController } from "../components/interaction/index.js";
import type { ReorderController } from "../components/interaction/ReorderController.js";

/** The V1 group-move operation kinds the router can produce. */
export type GroupMoveOperation = GroupReorderOperation | GroupReparentOperation;

/**
 * Resolved drag intent supplied by the pointer-event handler. Carries the data
 * both controller paths need so the router can classify once and dispatch
 * without re-reading the DOM.
 *
 * - `sourceParent` / `targetParent` — the ElementRef pair the drag spans. When
 *   their `runtimeId` values are equal the router takes the same-parent
 *   `reorderGroup` path; otherwise the cross-parent `reparentGroup` path.
 * - `sourceIndices` / `targetIndices` — parallel to `group.members`; used by
 *   `reparentGroup`.
 * - `newOrder` — the target DOM order parallel to `group.members`; used by
 *   `reorderGroup`.
 * - `sourceParentRole` / `targetParentRole` — classified layout roles; consumed
 *   by `classifyGroupMove`.
 */
export interface GroupDragIntent {
  readonly sourceParent: ElementRef;
  readonly targetParent: ElementRef;
  readonly sourceIndices: readonly number[];
  readonly targetIndices: readonly number[];
  readonly newOrder: readonly number[];
  readonly sourceParentRole: LayoutRole;
  readonly targetParentRole: LayoutRole;
  readonly sourceContextPositioned?: boolean;
  readonly targetContextPositioned?: boolean;
  readonly userIntent?: GroupFreeMoveIntent;
  readonly ownershipRisk?: boolean;
}

/**
 * Router result. `routed` carries the recorded operation; `rejected` carries
 * the D41 / grid diagnostic; `no-group` means no multi-select group is active.
 */
export type GroupMoveRouteResult =
  | { readonly kind: "routed"; readonly operation: GroupMoveOperation }
  | { readonly kind: "rejected"; readonly reason: string; readonly message: string }
  | { readonly kind: "no-group" };

export interface GroupMoveRouter {
  /** Set or clear the active multi-select group (the wiring drives this from the bus). */
  readonly setGroup: (group: MultiSelectGroup | null) => void;
  readonly getGroup: () => MultiSelectGroup | null;
  /** Classify and route a group drag to the matching controller method. */
  readonly route: (intent: GroupDragIntent) => GroupMoveRouteResult;
}

export interface GroupMoveRouterOptions {
  readonly reorder: ReorderController;
  readonly reparent: ReparentController;
}

/**
 * Create the group-move router. The router caches the latest multi-select
 * group and feeds it to {@link ReorderController.setMultiSelectGroup} on every
 * change so the same-parent path reads it from the controller's own state.
 */
export function createGroupMoveRouter(options: GroupMoveRouterOptions): GroupMoveRouter {
  const { reorder, reparent } = options;
  let group: MultiSelectGroup | null = null;

  const setGroup = (next: MultiSelectGroup | null): void => {
    group = next;
    reorder.setMultiSelectGroup(next);
  };

  const getGroup = (): MultiSelectGroup | null => group;

  const route = (intent: GroupDragIntent): GroupMoveRouteResult => {
    if (group === null) return { kind: "no-group" };

    const candidate = classifyGroupMove({
      sameParent: intent.sourceParent.runtimeId === intent.targetParent.runtimeId,
      sourceParentRole: intent.sourceParentRole,
      targetParentRole: intent.targetParentRole,
      validContentModel: true,
      sourceContextPositioned: intent.sourceContextPositioned === true,
      targetContextPositioned: intent.targetContextPositioned === true,
      ...(intent.userIntent !== undefined ? { userIntent: intent.userIntent } : {}),
      ownershipRisk: intent.ownershipRisk === true,
    });

    switch (candidate.kind) {
      case "group-reorder": {
        const operation = reorder.reorderGroup(intent.newOrder);
        if (operation === null) {
          return {
            kind: "rejected",
            reason: "reorder-group-noop",
            message: "group reorder produced no operation (unchanged order or stale members)",
          };
        }
        return { kind: "routed", operation };
      }
      case "group-reparent": {
        const operation = reparent.reparentGroup(
          group,
          intent.sourceParent,
          intent.sourceIndices,
          intent.targetParent,
          intent.targetIndices,
          intent.targetParentRole,
          intent.ownershipRisk === true,
        );
        if (operation === null) {
          return {
            kind: "rejected",
            reason: "reparent-group-noop",
            message: "group reparent produced no operation",
          };
        }
        return { kind: "routed", operation };
      }
      case "unsupported-group-free-move":
      case "unsupported-group-grid":
        return { kind: "rejected", reason: candidate.kind, message: candidate.message };
      case "positioned-free-move":
        return {
          kind: "rejected",
          reason: "positioned-free-move",
          message:
            "positioned-context free-move is classified but not routed by the group-move controller (per-member style-edit path is a separate concern)",
        };
      default: {
        const _exhaustive: never = candidate;
        void _exhaustive;
        return { kind: "rejected", reason: "unknown", message: "unknown group-move candidate" };
      }
    }
  };

  return { setGroup, getGroup, route };
}
