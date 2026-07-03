/**
 * Free-position command factory (PRD §9.2.C).
 *
 * Free-position is coordinate-based movement of an element that is ALREADY in a
 * positioned context, OR that the user has explicitly chosen to take out of
 * flow. The MVP `position-element` operation represents the CSS `position`
 * property change that establishes the positioned context (e.g. `"static"` →
 * `"absolute"`).
 *
 * PRD §9.2.C + Appendix D.2 (constraint 2) is BINDING: a normal-flow drag MUST
 * NOT auto-collapse into `position: absolute`. This factory enforces that guard
 * — see {@link createPositionCommand}. The guard is the seam the adversarial
 * D41 test targets: a normal-flow element with no positioned ancestor and no
 * explicit opt-in can NEVER produce a `position-element` intent from here.
 */

import type { ElementRef, PositionElementOperation } from "@vision-control/change-ir";
import { isNormalFlowRole, type LayoutRole } from "@vision-control/layout-engine";

import { type CommandBaseOptions, commandBase, toElementRef } from "./command-base.js";
import { UnsupportedLayoutError } from "./command-errors.js";

/**
 * Free-position mode (PRD §9.2.C vocabulary). `"absolute"` and `"fixed"` take
 * the element out of flow and trigger the D41 normal-flow guard.
 * `"relative-offset"` maps to in-flow `position: relative`. `"transform"` is
 * deferred — the MVP `position-element` op models only the CSS `position`
 * property and cannot express a transform-based free-position.
 */
export type Positioning = "absolute" | "fixed" | "relative-offset" | "transform";

/**
 * Layout context the free-position guard inspects. The factory is DOM-free; the
 * caller (panel or controller) supplies these values from its inspection of the
 * live element.
 */
export interface FreePositionLayoutContext {
  /** The element's current {@link LayoutRole} (positioned vs normal-flow). */
  readonly currentRole: LayoutRole;
  /**
   * True when a positioned ancestor can serve as the containing block. When
   * false, taking a normal-flow element out of flow requires
   * {@link CreatePositionCommandInput.explicitUserIntent}.
   */
  readonly hasPositionedAncestor: boolean;
  /** Current CSS `position` value (e.g. `"static"`); becomes the op's `fromValue`. */
  readonly currentPosition: string;
}

export interface CreatePositionCommandInput {
  readonly target: ElementRef | { readonly runtimeId: string };
  readonly positioning: Positioning;
  /**
   * Element that will contain the positioned element (PRD §9.2.C). Present when
   * a positioned ancestor exists; absent when the element itself becomes the
   * positioned context via explicit user intent. Not carried on the MVP op
   * (which models only the `position` property change) but used to document the
   * intended containing block.
   */
  readonly containingBlock?: ElementRef | { readonly runtimeId: string };
  readonly context: FreePositionLayoutContext;
  /**
   * Explicit user opt-in to take a normal-flow element out of flow. PRD §9.2.C:
   * free-position is default-allowed ONLY in an existing positioned context OR
   * with explicit intent. Without this flag, normal-flow → absolute/fixed is
   * rejected (Appendix D.2 constraint 2).
   */
  readonly explicitUserIntent?: boolean;
}

/**
 * Map a PRD {@link Positioning} mode to the CSS `position` value the
 * `position-element` operation carries as `toValue`. `"transform"` has no valid
 * CSS `position` value and throws `UNSUPPORTED_POSITIONING_MODE`.
 */
const positioningToCssValue = (positioning: Positioning): string => {
  switch (positioning) {
    case "absolute":
      return "absolute";
    case "fixed":
      return "fixed";
    case "relative-offset":
      return "relative";
    case "transform":
      throw new UnsupportedLayoutError(
        "UNSUPPORTED_POSITIONING_MODE",
        'positioning "transform" is not expressible by the MVP position-element op (deferred; requires a transform-edit op kind)',
      );
  }
};

/**
 * Create a {@link PositionElementOperation} establishing the requested
 * positioning context (PRD §9.2.C free-position).
 *
 * Enforces the D41 guard (PRD §9.2.C + Appendix D.2 constraint 2): converting a
 * normal-flow element to out-of-flow positioning (`absolute`/`fixed`) is
 * rejected with `UNSUPPORTED_LAYOUT` unless a positioned ancestor exists OR the
 * caller passes `explicitUserIntent: true`. `"relative-offset"` is in-flow and
 * does not trigger the guard. `"transform"` is unsupported in MVP scope.
 *
 * The returned operation's computed inverse swaps `fromValue`/`toValue`, so undo
 * restores the prior position value.
 */
export function createPositionCommand(
  input: CreatePositionCommandInput,
  options: CommandBaseOptions = {},
): PositionElementOperation {
  const toValue = positioningToCssValue(input.positioning);
  const takesOutOfFlow = input.positioning === "absolute" || input.positioning === "fixed";

  if (
    takesOutOfFlow &&
    isNormalFlowRole(input.context.currentRole) &&
    !input.context.hasPositionedAncestor &&
    !input.explicitUserIntent
  ) {
    throw new UnsupportedLayoutError(
      "UNSUPPORTED_LAYOUT",
      `free-position to "${input.positioning}" on a normal-flow element (${input.context.currentRole}) without a positioned ancestor requires explicitUserIntent (PRD §9.2.C / Appendix D.2)`,
    );
  }

  return {
    ...commandBase(options),
    kind: "position-element",
    target: toElementRef(input.target),
    property: "position",
    fromValue: input.context.currentPosition,
    toValue,
  };
}
