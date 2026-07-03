import type { InteractionEvent } from "../events.js";
import {
  assertNeverState,
  type InteractionMachineState,
  illegalTransition,
  noEffects,
  type RawResult,
  withContext,
} from "../machine-types.js";
import type { TopLevelCompound } from "../states.js";

/**
 * Handlers for the non-`selected` top-level compounds: `idle`, `hovering`,
 * `verifying`. (`disconnected` is a global sink handled in `machine.ts`.)
 *
 * Each returns a {@link RawResult}; the debug log is attached by the public
 * `transition`. The `default` branch rejects any event not on a PRD section 10
 * edge for that state.
 */

const fromIdle = (state: InteractionMachineState, event: InteractionEvent): RawResult => {
  switch (event.type) {
    case "pick-start":
      return { state: withContext(state, {}, "hovering"), effects: [] };
    case "element-clicked":
      return {
        state: withContext(state, { pendingSelection: event.target }, "selected.awaiting-commit"),
        effects: [{ kind: "show-outline", target: event.target }],
      };
    case "escape":
    case "deselect":
      return noEffects(state);
    case "verify-start":
    case "verify-end":
    case "reconnect":
      return illegalTransition(state, event);
    default:
      return illegalTransition(state, event);
  }
};

const fromHovering = (state: InteractionMachineState, event: InteractionEvent): RawResult => {
  switch (event.type) {
    case "pick-end":
      return { state: withContext(state, {}, "idle"), effects: [] };
    case "element-clicked":
      return {
        state: withContext(state, { pendingSelection: event.target }, "selected.awaiting-commit"),
        effects: [{ kind: "show-outline", target: event.target }],
      };
    case "escape":
    case "deselect":
      return { state: withContext(state, {}, "idle"), effects: [] };
    default:
      return illegalTransition(state, event);
  }
};

const fromVerifying = (state: InteractionMachineState, event: InteractionEvent): RawResult => {
  switch (event.type) {
    case "verify-end":
      return { state: withContext(state, {}, "selected"), effects: [{ kind: "end-verify" }] };
    case "escape":
      return { state: withContext(state, {}, "selected"), effects: [{ kind: "end-verify" }] };
    default:
      return illegalTransition(state, event);
  }
};

export const dispatchRootCompound = (
  compound: Exclude<TopLevelCompound, "selected" | "disconnected">,
  state: InteractionMachineState,
  event: InteractionEvent,
): RawResult => {
  switch (compound) {
    case "idle":
      return fromIdle(state, event);
    case "hovering":
      return fromHovering(state, event);
    case "verifying":
      return fromVerifying(state, event);
    default:
      return assertNeverState(compound);
  }
};
