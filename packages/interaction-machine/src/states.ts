import { z } from "zod";

/**
 * Interaction state machine — PRD section 10 hierarchical state graph.
 *
 * The machine holds ONE leaf state value at a time. This is the hard PRD
 * requirement: pointer interaction is NOT modeled as a bag of boolean flags
 * (`isDragging`, `isResizing`, ...). A single discriminated value makes the
 * legal transition set explicit and makes illegal combinations (e.g. dragging
 * AND resizing at once) unrepresentable in the value itself.
 *
 * PRD section 10 defines a HIERARCHY (compound states). It is encoded as
 * dotted-path leaf values so the single-string discriminator is preserved
 * (keeping "one state at a time" literally true) while the ancestry is
 * machine-readable. `selected.dragging.reorder-preview` means "inside the
 * `selected` compound state, inside its `dragging` child, in the
 * `reorder-preview` leaf". Subtree membership is a `startsWith` check.
 *
 * Hierarchy (PRD 10:758-770):
 *
 * ```
 * idle
 * ├── hovering
 * ├── selected
 * │   ├── editing-style
 * │   ├── editing-text
 * │   ├── preparing-drag
 * │   ├── dragging
 * │   │   ├── reorder-preview
 * │   │   ├── reparent-preview
 * │   │   └── free-position-preview
 * │   ├── resizing
 * │   ├── marquee-selecting
 * │   └── awaiting-commit
 * ├── verifying
 * └── disconnected
 * ```
 *
 * `selected` is both a compound parent and a leaf: the leaf is the
 * default/rest state (inspector open, no active gesture). Every compound
 * child is a leaf under the `selected.` prefix.
 */
export const INTERACTION_STATES = [
  // top-level
  "idle",
  "hovering",
  "verifying",
  "disconnected",
  // selected compound — default leaf + children
  "selected",
  "selected.editing-style",
  "selected.editing-text",
  "selected.preparing-drag",
  "selected.dragging",
  "selected.dragging.reorder-preview",
  "selected.dragging.reparent-preview",
  "selected.dragging.free-position-preview",
  "selected.resizing",
  "selected.marquee-selecting",
  "selected.awaiting-commit",
] as const;

export type InteractionStateValue = (typeof INTERACTION_STATES)[number];

export const InteractionStateValueSchema = z.enum(INTERACTION_STATES);

/**
 * The five PRD section 10 compound states. The top-level compound of any leaf
 * is the segment before the first dot.
 */
export const TOP_LEVEL_COMPOUNDS = [
  "idle",
  "hovering",
  "selected",
  "verifying",
  "disconnected",
] as const;
export type TopLevelCompound = (typeof TOP_LEVEL_COMPOUNDS)[number];

/** Compound-state ancestry of a leaf, e.g. `"selected.dragging.reorder-preview"` -> `"selected"`. */
export const topLevelOf = (value: InteractionStateValue): TopLevelCompound => {
  const dot = value.indexOf(".");
  return (dot === -1 ? value : value.slice(0, dot)) as TopLevelCompound;
};

const SELECTED_PREFIX = "selected";
const DRAGGING_LEAF = "selected.dragging";
const PREVIEW_SUFFIX = "-preview";

/** True for `selected` and every `selected.*` leaf (the whole selected subtree). */
export const isInSelectedSubtree = (value: InteractionStateValue): boolean =>
  value === SELECTED_PREFIX || value.startsWith(`${SELECTED_PREFIX}.`);

/** True for `selected.dragging` and its three preview children. */
export const isInDraggingSubtree = (value: InteractionStateValue): boolean =>
  value === DRAGGING_LEAF || value.startsWith(`${DRAGGING_LEAF}.`);

/** True for the three drag-preview leaves (a preview transaction is open). */
export const isPreviewState = (value: InteractionStateValue): boolean =>
  isInDraggingSubtree(value) && value.endsWith(PREVIEW_SUFFIX) && value !== DRAGGING_LEAF;

/**
 * States that own a pointer for an active gesture (PRD 10 invariant 1:
 * "at most one pointer-owning interaction is active at a time"). A drag press,
 * an active drag, a resize, and a marquee all capture the pointer; the
 * pointer-ownership invariant forbids two of these being active simultaneously.
 */
export const POINTER_OWNING_STATES: readonly InteractionStateValue[] = [
  "selected.preparing-drag",
  "selected.dragging",
  "selected.dragging.reorder-preview",
  "selected.dragging.reparent-preview",
  "selected.dragging.free-position-preview",
  "selected.resizing",
  "selected.marquee-selecting",
];

export const isPointerOwningState = (value: InteractionStateValue): boolean =>
  POINTER_OWNING_STATES.includes(value);
