import type { GroupReorderOperation, GroupReparentOperation } from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { ElementRef } from "@vision-control/element-identity";

import type { PointerId } from "./pointer-ownership.js";

/**
 * Group-move interaction reducer — a PURE addition to the interaction machine
 * (like `multi-select-transitions.ts`). It does NOT modify the existing
 * `InteractionStateValue` graph or the main `transition()` reducer.
 *
 * It models a group-move gesture (same-parent sibling reorder, group reparent,
 * or positioned-context free-move) over a {@link MultiSelectGroup}, building
 * the matching V1 operation with per-element source refs and full inverse data.
 * Like the main machine, this reducer is pure (no DOM) and emits side-effect
 * DESCRIPTIONS (`GroupMoveEffect`); the browser controller performs the preview
 * and journal commit.
 *
 * PRD constraint 2 / MVP D41 is enforced upstream by the layout-engine
 * `classifyGroupMove` classifier: a normal-flow group free-move is rejected
 * with `unsupported-group-free-move` before it reaches this reducer. This
 * reducer never produces a `position: absolute` source intent.
 */

/** The resolved V1 group-move operation produced by a gesture. */
export type GroupMoveOperation = GroupReorderOperation | GroupReparentOperation;

export interface GroupMoveReducerOptions {
  /**
   * Operation id allocator. Default uses Web Crypto `randomUUID()`. Tests inject
   * a deterministic allocator for stable ids (flaky-class guard).
   */
  readonly generateId?: () => string;
}

const defaultGenerateId = (): string => globalThis.crypto.randomUUID();

const newId = (options: GroupMoveReducerOptions): string =>
  (options.generateId ?? defaultGenerateId)();

/** Map a multi-select member to the change-ir ElementRef shape (per-element ref). */
const toElementRef = (member: MultiSelectGroup["members"][number]): ElementRef => {
  const ref: ElementRef = { runtimeId: member.runtimeId, tagName: member.tagName };
  if (member.sourceId !== undefined) ref.sourceId = member.sourceId;
  if (member.selector !== undefined) ref.selector = member.selector;
  return ref;
};

const assertParallelLength = (
  label: string,
  members: readonly unknown[],
  ...arrays: readonly (readonly unknown[])[]
): void => {
  for (const arr of arrays) {
    if (arr.length !== members.length) {
      throw new Error(
        `${label}: expected arrays parallel to the ${members.length} group members, got length ${arr.length}`,
      );
    }
  }
};

/**
 * Build a `group-reorder` operation from a multi-select group and a reorder
 * intent. `previousOrder`/`newOrder` are parallel to `group.members`:
 * `previousOrder[i]` is the original DOM index of member i; `newOrder[i]` is
 * its target DOM index. The operation carries per-child ElementRefs (from the
 * group) and the full before/after index arrays, giving `computeInverse`
 * everything it needs to swap them.
 *
 * Throws when the parent does not match the group's `commonParent` (stale-state
 * guard) or when the order arrays are not parallel to the member count.
 */
export const buildGroupReorderOperation = (
  group: MultiSelectGroup,
  parent: ElementRef,
  previousOrder: readonly number[],
  newOrder: readonly number[],
  options: GroupMoveReducerOptions = {},
): GroupReorderOperation => {
  if (group.commonParent === null || group.commonParent.runtimeId !== parent.runtimeId) {
    throw new Error(
      "group-reorder parent must match the group's common parent (stale or mismatched reference)",
    );
  }
  assertParallelLength("group-reorder", group.members, previousOrder, newOrder);

  return {
    id: newId(options),
    kind: "group-reorder",
    runtime: false,
    timestamp: Date.now(),
    parent,
    children: group.members.map(toElementRef),
    previousOrder: [...previousOrder],
    newOrder: [...newOrder],
  };
};

/**
 * Build a `group-reparent` operation from a multi-select group and a reparent
 * intent. `sourceIndices`/`targetIndices` are parallel to `group.members`. The
 * inverse (computed by change-ir) swaps the `(sourceParent, sourceIndices)` and
 * `(targetParent, targetIndices)` pairs.
 *
 * Throws when the index arrays are not parallel to the member count.
 */
export const buildGroupReparentOperation = (
  group: MultiSelectGroup,
  sourceParent: ElementRef,
  sourceIndices: readonly number[],
  targetParent: ElementRef,
  targetIndices: readonly number[],
  options: GroupMoveReducerOptions = {},
): GroupReparentOperation => {
  assertParallelLength("group-reparent", group.members, sourceIndices, targetIndices);

  return {
    id: newId(options),
    kind: "group-reparent",
    runtime: false,
    timestamp: Date.now(),
    elements: group.members.map(toElementRef),
    sourceParent,
    sourceIndices: [...sourceIndices],
    targetParent,
    targetIndices: [...targetIndices],
  };
};

/**
 * Lifecycle of a group-move gesture.
 *
 * - `idle` — no gesture active.
 * - `pending` — a group is captured and a pointer owns the gesture; awaiting a
 *   reorder/reparent/free-move resolution.
 * - `committed` — an operation has been built; awaiting journal commit.
 * - `rejected` — the gesture was cancelled or failed validation.
 */
export type GroupMoveState =
  | { readonly kind: "idle" }
  | { readonly kind: "pending"; readonly group: MultiSelectGroup; readonly pointerId: PointerId }
  | {
      readonly kind: "committed";
      readonly operation: GroupMoveOperation;
      readonly pointerId: PointerId;
    }
  | { readonly kind: "rejected"; readonly reason: string };

export const createInitialGroupMoveState = (): GroupMoveState => ({ kind: "idle" });

/** Side-effect descriptions emitted by the group-move reducer. */
export type GroupMoveEffect =
  | { readonly kind: "preview-group-move"; readonly operation: GroupMoveOperation }
  | { readonly kind: "commit-group-move"; readonly operation: GroupMoveOperation }
  | { readonly kind: "group-move-error"; readonly reason: string };

/** Events accepted by the group-move reducer. */
export type GroupMoveEvent =
  | { readonly type: "begin"; readonly group: MultiSelectGroup; readonly pointerId: PointerId }
  | {
      readonly type: "reorder";
      readonly parent: ElementRef;
      readonly previousOrder: readonly number[];
      readonly newOrder: readonly number[];
    }
  | {
      readonly type: "reparent";
      readonly sourceParent: ElementRef;
      readonly sourceIndices: readonly number[];
      readonly targetParent: ElementRef;
      readonly targetIndices: readonly number[];
    }
  | { readonly type: "commit" }
  | { readonly type: "cancel"; readonly reason: string };

export interface GroupMoveTransitionResult {
  readonly state: GroupMoveState;
  readonly effects: readonly GroupMoveEffect[];
}

const error = (reason: string, state: GroupMoveState): GroupMoveTransitionResult => ({
  state,
  effects: [{ kind: "group-move-error", reason }],
});

/**
 * The group-move transition function: `(state, event, options?) -> { state, effects }`.
 * Pure. The existing interaction-machine transition graph is unchanged; this is
 * an additive reducer wired alongside the main machine and the multi-select
 * reducer by the extension (browser layer).
 */
export const transitionGroupMove = (
  state: GroupMoveState,
  event: GroupMoveEvent,
  options: GroupMoveReducerOptions = {},
): GroupMoveTransitionResult => {
  switch (event.type) {
    case "begin": {
      if (event.group.members.length < 2) {
        return error("group-move requires at least 2 members", state);
      }
      return {
        state: { kind: "pending", group: event.group, pointerId: event.pointerId },
        effects: [],
      };
    }

    case "reorder": {
      if (state.kind !== "pending") {
        return error("reorder requires an active group-move gesture", state);
      }
      let operation: GroupReorderOperation;
      try {
        operation = buildGroupReorderOperation(
          state.group,
          event.parent,
          event.previousOrder,
          event.newOrder,
          options,
        );
      } catch (failure) {
        const reason = failure instanceof Error ? failure.message : String(failure);
        return {
          state: { kind: "rejected", reason },
          effects: [{ kind: "group-move-error", reason }],
        };
      }
      return {
        state: { kind: "committed", operation, pointerId: state.pointerId },
        effects: [{ kind: "preview-group-move", operation }],
      };
    }

    case "reparent": {
      if (state.kind !== "pending") {
        return error("reparent requires an active group-move gesture", state);
      }
      let operation: GroupReparentOperation;
      try {
        operation = buildGroupReparentOperation(
          state.group,
          event.sourceParent,
          event.sourceIndices,
          event.targetParent,
          event.targetIndices,
          options,
        );
      } catch (failure) {
        const reason = failure instanceof Error ? failure.message : String(failure);
        return {
          state: { kind: "rejected", reason },
          effects: [{ kind: "group-move-error", reason }],
        };
      }
      return {
        state: { kind: "committed", operation, pointerId: state.pointerId },
        effects: [{ kind: "preview-group-move", operation }],
      };
    }

    case "commit": {
      if (state.kind !== "committed") {
        return { state, effects: [] };
      }
      return { state, effects: [{ kind: "commit-group-move", operation: state.operation }] };
    }

    case "cancel": {
      return { state: { kind: "rejected", reason: event.reason }, effects: [] };
    }

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return { state, effects: [] };
    }
  }
};
