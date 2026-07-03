/**
 * Structural command factories (PRD §9.10).
 *
 * Each factory builds the change-ir operation(s) for one PRD §9.10 structural
 * command WITHOUT mutating a ChangeSet. Every operation kind used here has a
 * computed inverse in `@vision-control/change-ir` (`computeInverse`), so every
 * structural command is reversible: duplicate→remove the copy, delete→re-insert,
 * wrap↔unwrap, insert→remove, set-container-layout→swap value/previousValue.
 *
 * The factories are pure (DOM-free): callers supply element refs and layout
 * context; the factories never read `getComputedStyle`. Guards that need layout
 * knowledge (move-to-front/back positioned-context check) take a
 * {@link LayoutRole} input rather than inspecting the DOM.
 */

import type {
  DuplicateElementOperation,
  ElementRef,
  InsertElementOperation,
  RemoveElementOperation,
  SetContainerLayoutOperation,
  StyleEditOperation,
  UnwrapElementOperation,
  WrapElementsOperation,
} from "@vision-control/change-ir";
import type { LayoutRole } from "@vision-control/layout-engine";

import { type CommandBaseOptions, commandBase, toElementRef } from "./command-base.js";
import { UnsupportedLayoutError } from "./command-errors.js";

const DEFAULT_CONTAINER_TAG = "div";

/** Read-only attribute map matching the operation `attributes` field shape. */
type AttributeMap = Readonly<Record<string, string>>;

/** True for roles that establish a positioned (out-of-flow or sticky) context. */
const isPositionedRole = (role: LayoutRole): boolean =>
  role === "absolute" || role === "fixed" || role === "sticky";

function asElementRef(target: ElementRef | { readonly runtimeId: string }): ElementRef {
  return toElementRef(target);
}

/**
 * Duplicate `source` into `parent` at `index`, producing a fresh node referenced
 * by `duplicate`. Maps to a `duplicate-element` operation; its computed inverse
 * is a `remove-element` on the copy, so undo restores a single instance.
 */
export function createDuplicateCommand(
  input: {
    readonly source: ElementRef | { readonly runtimeId: string };
    readonly duplicate: ElementRef | { readonly runtimeId: string };
    readonly parent: ElementRef | { readonly runtimeId: string };
    readonly index: number;
    readonly tagName: string;
  },
  options: CommandBaseOptions = {},
): DuplicateElementOperation {
  return {
    ...commandBase(options),
    kind: "duplicate-element",
    source: asElementRef(input.source),
    duplicate: asElementRef(input.duplicate),
    parent: asElementRef(input.parent),
    index: input.index,
    tagName: input.tagName,
  };
}

/**
 * Delete `element` from `parent` at `index`. Maps to a `remove-element`
 * operation; its computed inverse is an `insert-element` that re-inserts the
 * node with its captured `tagName`/`attributes`, so undo restores it.
 */
export function createDeleteCommand(
  input: {
    readonly element: ElementRef | { readonly runtimeId: string };
    readonly parent: ElementRef | { readonly runtimeId: string };
    readonly index: number;
    readonly tagName: string;
    readonly attributes?: AttributeMap;
  },
  options: CommandBaseOptions = {},
): RemoveElementOperation {
  return {
    ...commandBase(options),
    kind: "remove-element",
    element: asElementRef(input.element),
    parent: asElementRef(input.parent),
    index: input.index,
    tagName: input.tagName,
    ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
  };
}

/**
 * Wrap one or more `targets` in a new `wrapper` element under `parent` (PRD
 * §9.10 "wrap in container"). Maps to a `wrap-elements` operation; its computed
 * inverse is `unwrap-element`, so wrap→unwrap restores the original structure.
 */
export function createWrapInContainerCommand(
  input: {
    readonly targets: readonly (ElementRef | { readonly runtimeId: string })[];
    readonly wrapper: ElementRef | { readonly runtimeId: string };
    readonly parent: ElementRef | { readonly runtimeId: string };
    readonly tagName?: string;
  },
  options: CommandBaseOptions = {},
): WrapElementsOperation {
  if (input.targets.length === 0) {
    throw new UnsupportedLayoutError(
      "UNSUPPORTED_LAYOUT",
      "wrap-in-container requires at least one target element",
    );
  }
  return {
    ...commandBase(options),
    kind: "wrap-elements",
    targets: input.targets.map(asElementRef),
    wrapper: asElementRef(input.wrapper),
    parent: asElementRef(input.parent),
    tagName: input.tagName ?? DEFAULT_CONTAINER_TAG,
  };
}

/**
 * Remove `wrapper`, promoting its `targets` up to `parent` (PRD §9.10 "unwrap").
 * Maps to an `unwrap-element` operation; its computed inverse is `wrap-elements`.
 */
export function createUnwrapCommand(
  input: {
    readonly wrapper: ElementRef | { readonly runtimeId: string };
    readonly parent: ElementRef | { readonly runtimeId: string };
    readonly targets: readonly (ElementRef | { readonly runtimeId: string })[];
    readonly tagName?: string;
  },
  options: CommandBaseOptions = {},
): UnwrapElementOperation {
  if (input.targets.length === 0) {
    throw new UnsupportedLayoutError(
      "UNSUPPORTED_LAYOUT",
      "unwrap requires at least one target element",
    );
  }
  return {
    ...commandBase(options),
    kind: "unwrap-element",
    wrapper: asElementRef(input.wrapper),
    parent: asElementRef(input.parent),
    tagName: input.tagName ?? DEFAULT_CONTAINER_TAG,
    targets: input.targets.map(asElementRef),
  };
}

/**
 * Group a multi-element selection by wrapping it in a new container (PRD §9.10
 * "group selection"). Semantically distinct from {@link createWrapInContainerCommand}:
 * a group requires two or more targets. Maps to `wrap-elements`.
 */
export function createGroupSelectionCommand(
  input: {
    readonly targets: readonly (ElementRef | { readonly runtimeId: string })[];
    readonly wrapper: ElementRef | { readonly runtimeId: string };
    readonly parent: ElementRef | { readonly runtimeId: string };
    readonly tagName?: string;
  },
  options: CommandBaseOptions = {},
): WrapElementsOperation {
  if (input.targets.length < 2) {
    throw new UnsupportedLayoutError(
      "UNSUPPORTED_LAYOUT",
      "group-selection requires at least two target elements",
    );
  }
  return {
    ...commandBase(options),
    kind: "wrap-elements",
    targets: input.targets.map(asElementRef),
    wrapper: asElementRef(input.wrapper),
    parent: asElementRef(input.parent),
    tagName: input.tagName ?? DEFAULT_CONTAINER_TAG,
  };
}

/**
 * Create a new vertical stack container (flex column) under `parent` at `index`
 * (PRD §9.10 "create stack"). Maps to an `insert-element` whose `style` sets
 * `display:flex; flex-direction:column`; its computed inverse is `remove-element`.
 */
export function createStackCommand(
  input: {
    readonly element: ElementRef | { readonly runtimeId: string };
    readonly parent: ElementRef | { readonly runtimeId: string };
    readonly index: number;
    readonly tagName?: string;
  },
  options: CommandBaseOptions = {},
): InsertElementOperation {
  return {
    ...commandBase(options),
    kind: "insert-element",
    element: asElementRef(input.element),
    parent: asElementRef(input.parent),
    index: input.index,
    tagName: input.tagName ?? DEFAULT_CONTAINER_TAG,
    attributes: { style: "display:flex;flex-direction:column" },
  };
}

/**
 * Create a new flex container (row direction) under `parent` at `index` (PRD
 * §9.10 "create flex container"). Maps to an `insert-element`; inverse is
 * `remove-element`.
 */
export function createFlexContainerCommand(
  input: {
    readonly element: ElementRef | { readonly runtimeId: string };
    readonly parent: ElementRef | { readonly runtimeId: string };
    readonly index: number;
    readonly tagName?: string;
  },
  options: CommandBaseOptions = {},
): InsertElementOperation {
  return {
    ...commandBase(options),
    kind: "insert-element",
    element: asElementRef(input.element),
    parent: asElementRef(input.parent),
    index: input.index,
    tagName: input.tagName ?? DEFAULT_CONTAINER_TAG,
    attributes: { style: "display:flex;flex-direction:row" },
  };
}

interface ZIndexStackingInput {
  readonly target: ElementRef | { readonly runtimeId: string };
  readonly zIndex: string;
  readonly currentRole: LayoutRole;
  readonly previousZIndex?: string;
}

function buildZIndexStackingEdit(
  input: ZIndexStackingInput,
  options: CommandBaseOptions,
  commandName: "move-to-front" | "move-to-back",
): StyleEditOperation {
  if (!isPositionedRole(input.currentRole)) {
    throw new UnsupportedLayoutError(
      "UNSUPPORTED_LAYOUT",
      `${commandName} requires a positioned element (absolute/fixed/sticky); got role "${input.currentRole}"`,
    );
  }
  return {
    ...commandBase(options),
    kind: "style-edit",
    target: asElementRef(input.target),
    property: "z-index",
    value: input.zIndex,
    important: false,
    ...(input.previousZIndex !== undefined ? { previousValue: input.previousZIndex } : {}),
  };
}

/**
 * Move `target` to the front of its stacking context by setting `z-index` (PRD
 * §9.10 "move to front"). Supported ONLY in a positioned context. The caller
 * supplies the computed `zIndex`; the factory owns the guard. Maps to a
 * `style-edit`; inverse restores `previousZIndex`.
 */
export function createMoveToFrontCommand(
  input: ZIndexStackingInput,
  options: CommandBaseOptions = {},
): StyleEditOperation {
  return buildZIndexStackingEdit(input, options, "move-to-front");
}

/**
 * Move `target` to the back of its stacking context by setting `z-index` (PRD
 * §9.10 "move to back"). Same positioned-context guard as
 * {@link createMoveToFrontCommand}. Maps to a `style-edit`.
 */
export function createMoveToBackCommand(
  input: ZIndexStackingInput,
  options: CommandBaseOptions = {},
): StyleEditOperation {
  return buildZIndexStackingEdit(input, options, "move-to-back");
}

/**
 * Convert a container's layout to flex by setting `display: flex` (PRD §9.10
 * "convert layout to flex"). Maps to a `set-container-layout` operation on
 * property `"display"`; inverse restores `previousDisplay`.
 */
export function createConvertLayoutToFlexCommand(
  input: {
    readonly container: ElementRef | { readonly runtimeId: string };
    readonly previousDisplay?: string;
  },
  options: CommandBaseOptions = {},
): SetContainerLayoutOperation {
  return {
    ...commandBase(options),
    kind: "set-container-layout",
    container: asElementRef(input.container),
    property: "display",
    value: "flex",
    ...(input.previousDisplay !== undefined ? { previousValue: input.previousDisplay } : {}),
  };
}

/**
 * Convert a container's layout to grid by setting `display: grid` (PRD §9.10
 * "convert layout to grid"). Maps to a `set-container-layout` operation;
 * inverse restores `previousDisplay`.
 */
export function createConvertLayoutToGridCommand(
  input: {
    readonly container: ElementRef | { readonly runtimeId: string };
    readonly previousDisplay?: string;
  },
  options: CommandBaseOptions = {},
): SetContainerLayoutOperation {
  return {
    ...commandBase(options),
    kind: "set-container-layout",
    container: asElementRef(input.container),
    property: "display",
    value: "grid",
    ...(input.previousDisplay !== undefined ? { previousValue: input.previousDisplay } : {}),
  };
}
