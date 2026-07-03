/**
 * Auto Layout command vocabulary (VC-V1V2-08 / PRD section 639-693).
 *
 * These are the user-facing intent types the Auto Layout panel emits. They are
 * pure value descriptions — no DOM, no computed-style reads. The
 * {@linkcode "../auto-layout-candidates.js" resolveAutoLayoutCandidate} resolver
 * maps each command onto semantic candidates that align structurally with the
 * `set-container-layout` / `set-child-sizing` operations in `@vision-control/change-ir`
 * (without importing that package; the layout-engine is DOM-free and change-ir-free).
 *
 * The sizing vocabulary (`hug` / `fill` / `fixed`) intentionally does NOT carry a
 * single CSS property. The concrete resolution depends on the parent/child context
 * and lives in {@linkcode "./hug-fill-fixed.js" resolveHugFillFixed}.
 */

/** Flex-direction intent. Maps to the CSS `flex-direction` property family. */
export const AUTO_LAYOUT_DIRECTIONS = ["row", "row-reverse", "column", "column-reverse"] as const;
export type AutoLayoutDirection = (typeof AUTO_LAYOUT_DIRECTIONS)[number];

/** Main-axis (justify-content) alignment intent. */
export const AUTO_LAYOUT_ALIGN_MAIN = [
  "flex-start",
  "center",
  "flex-end",
  "space-between",
  "space-around",
  "space-evenly",
] as const;
export type AutoLayoutAlignMain = (typeof AUTO_LAYOUT_ALIGN_MAIN)[number];

/** Cross-axis (align-items) alignment intent. */
export const AUTO_LAYOUT_ALIGN_CROSS = [
  "flex-start",
  "center",
  "flex-end",
  "stretch",
  "baseline",
] as const;
export type AutoLayoutAlignCross = (typeof AUTO_LAYOUT_ALIGN_CROSS)[number];

/** Flex-wrap intent. */
export const AUTO_LAYOUT_WRAP = ["nowrap", "wrap", "wrap-reverse"] as const;
export type AutoLayoutWrap = (typeof AUTO_LAYOUT_WRAP)[number];

/**
 * How a padding edit is distributed across the four sides. The panel exposes
 * four UI affordances: set all four sides at once, set horizontal (left+right),
 * set vertical (top+bottom), or set each side individually.
 */
export const PADDING_MODES = ["all", "horizontal", "vertical", "individual"] as const;
export type PaddingMode = (typeof PADDING_MODES)[number];

/** The four physical sides of a box, in clockwise order starting from top. */
export const BOX_SIDES = ["top", "right", "bottom", "left"] as const;
export type BoxSide = (typeof BOX_SIDES)[number];

/**
 * Child sizing intent — Figma Hug/Fill/Fixed vocabulary (PRD section 639-693).
 * This is the canonical enum; it aligns with `ChildSizingSchema` in change-ir.
 * The concrete CSS resolution is context-sensitive (see `hug-fill-fixed.ts`).
 */
export const CHILD_SIZING_INTENTS = ["hug", "fill", "fixed"] as const;
export type ChildSizingIntent = (typeof CHILD_SIZING_INTENTS)[number];

/** Set the flex-direction of a container. */
export interface SetDirectionCommand {
  readonly kind: "set-direction";
  readonly direction: AutoLayoutDirection;
}

/** Set the main-axis (justify-content) gap between flex children. */
export interface SetGapCommand {
  readonly kind: "set-gap";
  readonly value: string;
  /** When set, this is a row-gap or column-gap (CSS `row-gap` / `column-gap`). */
  readonly axis?: "row" | "column";
}

/** Set padding on a container using one of the {@link PaddingMode} affordances. */
export interface SetPaddingCommand {
  readonly kind: "set-padding";
  readonly mode: PaddingMode;
  /** Value for the "all" / "horizontal" / "vertical" mode. */
  readonly value: string;
  /**
   * Per-side values, required only for `mode: "individual"`. Keys are
   * {@link BoxSide}; omitted sides are left unchanged.
   */
  readonly sides?: Readonly<Partial<Record<BoxSide, string>>>;
}

/** Set the main-axis (justify-content) alignment of a container. */
export interface SetAlignMainCommand {
  readonly kind: "set-align-main";
  readonly value: AutoLayoutAlignMain;
}

/** Set the cross-axis (align-items) alignment of a container. */
export interface SetAlignCrossCommand {
  readonly kind: "set-align-cross";
  readonly value: AutoLayoutAlignCross;
}

/** Set the flex-wrap behavior of a container. */
export interface SetWrapCommand {
  readonly kind: "set-wrap";
  readonly value: AutoLayoutWrap;
}

/** Set the sizing intent of a single child within a container. */
export interface SetChildSizingCommand {
  readonly kind: "set-child-sizing";
  /** Index of the child within the container's children list (0-based). */
  readonly childIndex: number;
  readonly intent: ChildSizingIntent;
  /** Required for `intent: "fixed"`; the explicit CSS value, e.g. `"200px"`. */
  readonly value?: string;
}

/**
 * Discriminated union of every Auto Layout panel command. Each member maps to
 * either a `set-container-layout` operation (container-level) or a
 * `set-child-sizing` operation (child-level) in change-ir.
 */
export type AutoLayoutCommand =
  | SetDirectionCommand
  | SetGapCommand
  | SetPaddingCommand
  | SetAlignMainCommand
  | SetAlignCrossCommand
  | SetWrapCommand
  | SetChildSizingCommand;

/** Discriminator literal values for every Auto Layout command. */
export const AUTO_LAYOUT_COMMAND_KINDS = [
  "set-direction",
  "set-gap",
  "set-padding",
  "set-align-main",
  "set-align-cross",
  "set-wrap",
  "set-child-sizing",
] as const;
export type AutoLayoutCommandKind = (typeof AUTO_LAYOUT_COMMAND_KINDS)[number];

/** Whether a command targets the container itself (not a specific child). */
export const isContainerLevelCommand = (command: AutoLayoutCommand): boolean =>
  command.kind !== "set-child-sizing";
