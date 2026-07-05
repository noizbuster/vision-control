import { createOperationId } from "@vision-control/change-ir";
import type { ConstraintViolation, MultiSelectGroup } from "@vision-control/editor-core";
import { createMultiSelectGroup } from "@vision-control/editor-core";
import {
  createMultiSelectGroupId,
  type ElementRef,
  type MultiSelectGroupId,
  type MultiSelectMember,
} from "@vision-control/element-identity";
import type { Rect } from "@vision-control/geometry";

/**
 * Multi-select interaction reducer — a PURE addition to the interaction
 * machine. It does NOT modify the existing `InteractionStateValue` graph or
 * the main `transition()` reducer. It models the multi-select lifecycle
 * (Shift+Click add/remove, marquee-select, group commit/clear) as an
 * independent isomorphic reducer that the extension wires alongside the main
 * machine.
 *
 * Like the main machine, this reducer is pure (no DOM, no side effects) and
 * emits side-effect DESCRIPTIONS (`MultiSelectEffect`); the browser packages
 * perform the actual overlay mutation and journal commit.
 */

/**
 * The multi-select reducer state. The parallel `members` / `memberRects` /
 * `parentChains` triples are the source of truth used to rebuild the group on
 * every toggle; `group` is the computed result (null while fewer than two
 * members or while constraints fail).
 */
export interface MultiSelectState {
  readonly group: MultiSelectGroup | null;
  readonly members: readonly MultiSelectMember[];
  readonly memberRects: readonly Rect[];
  readonly parentChains: readonly (readonly ElementRef[])[];
}

export const createInitialMultiSelectState = (): MultiSelectState => ({
  group: null,
  members: [],
  memberRects: [],
  parentChains: [],
});

/** Side-effect descriptions emitted by the multi-select reducer. */
export type MultiSelectEffect =
  | { readonly kind: "show-multi-outline"; readonly group: MultiSelectGroup }
  | { readonly kind: "hide-multi-outline" }
  | { readonly kind: "commit-multi-select-group"; readonly group: MultiSelectGroup }
  | { readonly kind: "multi-select-error"; readonly violations: readonly ConstraintViolation[] };

/** Events accepted by the multi-select reducer. */
export type MultiSelectEvent =
  | {
      readonly type: "shift-click";
      readonly member: MultiSelectMember;
      readonly memberRect: Rect;
      readonly parentChain: readonly ElementRef[];
    }
  | {
      readonly type: "marquee-select";
      readonly marqueeRect: Rect;
      readonly members: readonly MultiSelectMember[];
      readonly memberRects: readonly Rect[];
      readonly parentChains: readonly (readonly ElementRef[])[];
    }
  | { readonly type: "group-commit" }
  | { readonly type: "group-clear" };

export interface MultiSelectReducerOptions {
  /**
   * Group id allocator. Tests inject a deterministic allocator for stable ids
   * (flaky-class guard).
   */
  readonly generateGroupId?: () => MultiSelectGroupId;
}

export interface MultiSelectTransitionResult {
  readonly state: MultiSelectState;
  readonly effects: readonly MultiSelectEffect[];
}

const defaultGenerateGroupId = (): MultiSelectGroupId =>
  createMultiSelectGroupId(createOperationId());

/**
 * Rebuild the group from the parallel member/rect/chain triples. Sub-two
 * members is a silent pending state (group null, no outline, no error). At two
 * or more, run the constraint check: success emits `show-multi-outline`,
 * failure emits `multi-select-error` and resets the member set. The group id is
 * allocated lazily (only on the success/failure paths) so a pending sub-two
 * state never burns an id.
 */
const rebuild = (
  generateGroupId: () => MultiSelectGroupId,
  members: readonly MultiSelectMember[],
  memberRects: readonly Rect[],
  parentChains: readonly (readonly ElementRef[])[],
): MultiSelectTransitionResult => {
  if (members.length < 2) {
    return { state: { group: null, members, memberRects, parentChains }, effects: [] };
  }
  const result = createMultiSelectGroup({
    id: generateGroupId(),
    members,
    memberRects,
    parentChains,
  });
  if (result.ok) {
    return {
      state: { group: result.group, members, memberRects, parentChains },
      effects: [{ kind: "show-multi-outline", group: result.group }],
    };
  }
  return {
    state: { group: null, members: [], memberRects: [], parentChains: [] },
    effects: [{ kind: "multi-select-error", violations: result.violations }],
  };
};

/**
 * The multi-select transition function: `(state, event, options?) -> { state, effects }`.
 * Pure. The existing interaction-machine transition graph is unchanged; this is
 * an additive reducer.
 */
export const transitionMultiSelect = (
  state: MultiSelectState,
  event: MultiSelectEvent,
  options: MultiSelectReducerOptions = {},
): MultiSelectTransitionResult => {
  const generateGroupId = options.generateGroupId ?? defaultGenerateGroupId;

  switch (event.type) {
    case "shift-click": {
      const existingIndex = state.members.findIndex((m) => m.runtimeId === event.member.runtimeId);
      if (existingIndex >= 0) {
        const members = state.members.filter((_, i) => i !== existingIndex);
        const memberRects = state.memberRects.filter((_, i) => i !== existingIndex);
        const parentChains = state.parentChains.filter((_, i) => i !== existingIndex);
        if (members.length < 2) {
          return {
            state: { group: null, members, memberRects, parentChains },
            effects: [{ kind: "hide-multi-outline" }],
          };
        }
        return rebuild(generateGroupId, members, memberRects, parentChains);
      }

      const members = [...state.members, event.member];
      const memberRects = [...state.memberRects, event.memberRect];
      const parentChains = [...state.parentChains, event.parentChain];
      return rebuild(generateGroupId, members, memberRects, parentChains);
    }

    case "marquee-select": {
      return rebuild(generateGroupId, event.members, event.memberRects, event.parentChains);
    }

    case "group-commit": {
      if (state.group === null) {
        return {
          state,
          effects: [
            {
              kind: "multi-select-error",
              violations: [
                {
                  code: "too-few-members",
                  message: "Cannot commit: no active multi-select group.",
                },
              ],
            },
          ],
        };
      }
      return { state, effects: [{ kind: "commit-multi-select-group", group: state.group }] };
    }

    case "group-clear": {
      if (state.group === null && state.members.length === 0) {
        return { state, effects: [] };
      }
      return {
        state: createInitialMultiSelectState(),
        effects: [{ kind: "hide-multi-outline" }],
      };
    }

    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return { state, effects: [] };
    }
  }
};
