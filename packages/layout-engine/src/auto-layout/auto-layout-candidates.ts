/**
 * Resolve Auto Layout panel commands into semantic candidates (VC-V1V2-08).
 *
 * Each candidate carries the property/value that maps onto a
 * `set-container-layout` operation (container-level) or `set-child-sizing`
 * operation (child-level) in `@vision-control/change-ir`. The candidate kinds
 * align structurally with the change-ir discriminators — layout-engine never
 * imports change-ir (it is isomorphic and deliberately decoupled).
 *
 * The container context classification rejects inline/unknown containers with an
 * `unsupported-container` diagnostic (adversarial class: misleading-success-output).
 * No invalid CSS is ever emitted for those contexts.
 */

import type { LayoutRole } from "../layout-role.js";
import type { AutoLayoutCommand, BoxSide, PaddingMode } from "./auto-layout-commands.js";
import {
  resolveHugFillFixed,
  type SizingParentContext,
  tryResolveHugFillFixed,
} from "./hug-fill-fixed.js";

/**
 * The container's layout context. The caller (browser inspector) supplies the
 * role + display; this module never reads `getComputedStyle`.
 */
export interface AutoLayoutContainerContext {
  readonly layoutRole: LayoutRole;
  /** The element's `display` (e.g. `"flex"`, `"grid"`, `"block"`). */
  readonly display: string;
  /** The element's `flex-direction` (meaningful when `display === "flex"`). */
  readonly flexDirection: string;
}

/** The parent context of a child being sized (for Hug/Fill/Fixed resolution). */
export type ChildParentContext = SizingParentContext;

/**
 * One property/value edit on the container. Multiple may be produced for a
 * single command (e.g. individual padding sets up to 4 properties).
 */
export interface ContainerPropertyCandidate {
  readonly kind: "container-layout";
  readonly property: string;
  readonly value: string;
  readonly rationale: string;
}

/**
 * One child sizing edit. Carries the resolved CSS declarations from
 * `resolveHugFillFixed` — these are context-sensitive and may be multiple.
 */
export interface ChildSizingCandidate {
  readonly kind: "child-sizing";
  readonly childIndex: number;
  readonly intent: "hug" | "fill" | "fixed";
  readonly declarations: readonly { readonly property: string; readonly value: string }[];
  readonly rationale: string;
}

/** Diagnostic returned when the container is inline or unclassifiable. */
export interface UnsupportedContainerDiagnostic {
  readonly kind: "unsupported-container";
  readonly message: string;
}

/**
 * The result of resolving an Auto Layout command. Either one or more candidates
 * (container-level or child-level), or a single diagnostic.
 */
export type AutoLayoutCandidateResult =
  | {
      readonly resolved: true;
      readonly candidates: readonly (ContainerPropertyCandidate | ChildSizingCandidate)[];
    }
  | { readonly resolved: false; readonly diagnostic: UnsupportedContainerDiagnostic };

/** Check whether the container context is a valid Auto Layout target. */
export const isAutoLayoutSupported = (context: AutoLayoutContainerContext): boolean => {
  if (context.layoutRole === "inline" || context.layoutRole === "inline-block") return false;
  if (context.layoutRole === "unknown") return false;
  return true;
};

const unsupported = (message: string): AutoLayoutCandidateResult => ({
  resolved: false,
  diagnostic: { kind: "unsupported-container", message },
});

const fromDirection = (direction: string): ContainerPropertyCandidate => ({
  kind: "container-layout",
  property: "flex-direction",
  value: direction,
  rationale: "sets the main-axis direction of the flex container",
});

const fromGap = (
  value: string,
  axis: "row" | "column" | undefined,
): ContainerPropertyCandidate[] => {
  if (axis === "row") {
    return [
      {
        kind: "container-layout",
        property: "row-gap",
        value,
        rationale: "sets spacing between flex rows (cross-axis gap)",
      },
    ];
  }
  if (axis === "column") {
    return [
      {
        kind: "container-layout",
        property: "column-gap",
        value,
        rationale: "sets spacing between flex columns (main-axis gap)",
      },
    ];
  }
  return [
    {
      kind: "container-layout",
      property: "gap",
      value,
      rationale: "sets uniform spacing between all flex children",
    },
  ];
};

const SIDE_PROPERTY: Readonly<Record<BoxSide, string>> = {
  top: "padding-top",
  right: "padding-right",
  bottom: "padding-bottom",
  left: "padding-left",
};

const fromPadding = (
  mode: PaddingMode,
  value: string,
  sides: Readonly<Partial<Record<BoxSide, string>>> | undefined,
): ContainerPropertyCandidate[] => {
  if (mode === "all") {
    return [
      {
        kind: "container-layout",
        property: "padding",
        value,
        rationale: "sets all four padding sides uniformly",
      },
    ];
  }
  if (mode === "horizontal") {
    return [
      {
        kind: "container-layout",
        property: "padding-left",
        value,
        rationale: "horizontal padding: left side",
      },
      {
        kind: "container-layout",
        property: "padding-right",
        value,
        rationale: "horizontal padding: right side",
      },
    ];
  }
  if (mode === "vertical") {
    return [
      {
        kind: "container-layout",
        property: "padding-top",
        value,
        rationale: "vertical padding: top side",
      },
      {
        kind: "container-layout",
        property: "padding-bottom",
        value,
        rationale: "vertical padding: bottom side",
      },
    ];
  }
  // mode === "individual"
  const out: ContainerPropertyCandidate[] = [];
  if (sides !== undefined) {
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const v = sides[side];
      if (v !== undefined) {
        out.push({
          kind: "container-layout",
          property: SIDE_PROPERTY[side],
          value: v,
          rationale: `individual padding: ${side} side`,
        });
      }
    }
  }
  return out;
};

const fromAlignMain = (value: string): ContainerPropertyCandidate => ({
  kind: "container-layout",
  property: "justify-content",
  value,
  rationale: "sets main-axis (justify-content) alignment of flex children",
});

const fromAlignCross = (value: string): ContainerPropertyCandidate => ({
  kind: "container-layout",
  property: "align-items",
  value,
  rationale: "sets cross-axis (align-items) alignment of flex children",
});

const fromWrap = (value: string): ContainerPropertyCandidate => ({
  kind: "container-layout",
  property: "flex-wrap",
  value,
  rationale: "sets whether flex children wrap onto multiple lines",
});

/**
 * Derive the parent context for a child from the container's layout context.
 * A child of a flex-row container is a flex item whose main axis is horizontal.
 */
const deriveChildParentContext = (container: AutoLayoutContainerContext): ChildParentContext => {
  if (container.layoutRole === "flex-row") return "flex-row";
  if (container.layoutRole === "flex-column") return "flex-column";
  if (container.layoutRole === "grid") return "grid";
  return "block";
};

const fromChildSizing = (
  container: AutoLayoutContainerContext,
  childIndex: number,
  intent: "hug" | "fill" | "fixed",
  value: string | undefined,
):
  | { resolved: true; candidates: readonly ChildSizingCandidate[] }
  | { resolved: false; diagnostic: UnsupportedContainerDiagnostic } => {
  const parentContext = deriveChildParentContext(container);
  const result = tryResolveHugFillFixed({
    intent,
    parentContext,
    ...(value !== undefined ? { fixedValue: value } : {}),
  });
  if (!result.resolved) {
    return {
      resolved: false,
      diagnostic: {
        kind: "unsupported-container",
        message: result.message,
      },
    };
  }
  const resolution = resolveHugFillFixed({
    intent,
    parentContext,
    ...(value !== undefined ? { fixedValue: value } : {}),
  });
  return {
    resolved: true,
    candidates: [
      {
        kind: "child-sizing",
        childIndex,
        intent,
        declarations: resolution.declarations,
        rationale: resolution.rationale,
      },
    ],
  };
};

/**
 * Resolve an Auto Layout command into semantic candidates for the given
 * container context.
 *
 * Container-level commands (direction, gap, padding, alignment, wrap) produce
 * `container-layout` candidates. Child-sizing commands produce `child-sizing`
 * candidates whose declarations are resolved context-sensitively via
 * {@link resolveHugFillFixed}.
 *
 * Returns `unsupported-container` for inline/unknown container roles. No invalid
 * CSS is emitted in that case.
 */
export const resolveAutoLayoutCandidate = (
  command: AutoLayoutCommand,
  context: AutoLayoutContainerContext,
): AutoLayoutCandidateResult => {
  if (!isAutoLayoutSupported(context)) {
    return unsupported(
      `auto layout is not supported on a "${context.layoutRole}" container; no CSS applied`,
    );
  }

  if (command.kind === "set-child-sizing") {
    const result = fromChildSizing(context, command.childIndex, command.intent, command.value);
    if (!result.resolved) return { resolved: false, diagnostic: result.diagnostic };
    return { resolved: true, candidates: result.candidates };
  }

  const candidates: ContainerPropertyCandidate[] = [];

  switch (command.kind) {
    case "set-direction":
      candidates.push(fromDirection(command.direction));
      break;
    case "set-gap":
      candidates.push(...fromGap(command.value, command.axis));
      break;
    case "set-padding":
      candidates.push(...fromPadding(command.mode, command.value, command.sides));
      break;
    case "set-align-main":
      candidates.push(fromAlignMain(command.value));
      break;
    case "set-align-cross":
      candidates.push(fromAlignCross(command.value));
      break;
    case "set-wrap":
      candidates.push(fromWrap(command.value));
      break;
  }

  return { resolved: true, candidates };
};
