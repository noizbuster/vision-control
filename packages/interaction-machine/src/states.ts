import { z } from "zod";

/**
 * Interaction state machine — state values (PRD section 10).
 *
 * The machine holds ONE state value at a time. This is the hard PRD
 * requirement: pointer interaction is NOT modeled as a bag of boolean flags
 * (`isDragging`, `isResizing`, ...). A single discriminated value makes the
 * legal transition set explicit and makes illegal combinations (e.g. dragging
 * AND resizing at once) unrepresentable in the value itself.
 *
 * State semantics:
 * - `idle` — no element picked, no pointer interaction.
 * - `inspecting` — hover/picker is active; element under pointer outlined.
 * - `selecting` — an element was just clicked; selection is pending commit.
 * - `selected` — an element is chosen; the inspector is open. Edit gestures
 *   (drag, resize, text-edit) branch out from here.
 * - `dragging` — a pointer-owning drag is in progress (after the drag
 *   threshold was exceeded). Only ONE pointer-owning gesture at a time.
 * - `resizing` — a resize handle drag is in progress. Mutually exclusive with
 *   `dragging` by the pointer-ownership invariant.
 * - `editing-text` — inline text edit mode for the selected element.
 * - `previewing` — a preview transaction is open (drag preview, reparent
 *   preview). A preview MUST end in `preview-commit` or `preview-rollback`.
 */
export const INTERACTION_STATES = [
  "idle",
  "inspecting",
  "selecting",
  "selected",
  "dragging",
  "resizing",
  "editing-text",
  "previewing",
] as const;

export type InteractionStateValue = (typeof INTERACTION_STATES)[number];

export const InteractionStateValueSchema = z.enum(INTERACTION_STATES);

/**
 * States that own a pointer for an active gesture. The pointer-ownership
 * invariant forbids two of these being active simultaneously.
 */
export const POINTER_OWNING_STATES: readonly InteractionStateValue[] = ["dragging", "resizing"];

export const isPointerOwningState = (value: InteractionStateValue): boolean =>
  POINTER_OWNING_STATES.includes(value);
