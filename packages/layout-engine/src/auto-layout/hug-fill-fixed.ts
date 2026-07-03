/**
 * Context-sensitive Hug / Fill / Fixed resolution (VC-V1V2-08 / PRD section
 * 639-693, 2287-2311).
 *
 * The core contract: Hug/Fill/Fixed is NEVER equated with a single CSS property.
 * The resolution depends on the parent layout context (flex-row, flex-column,
 * block, grid) and the axis being sized. A "Hug" on a flex-row item resolves to
 * `flex: 0 0 auto` + `width: max-content` (main-axis); the same intent on a block
 * child resolves to `width: fit-content`. A "Fill" on a flex item resolves to
 * `flex: 1 1 0%`; on a block child it resolves to `width: 100%`.
 *
 * This module is pure and DOM-free. The caller supplies the parent context and
 * the child sizing intent; the module returns the concrete CSS declarations.
 */

import type { ChildSizingIntent } from "./auto-layout-commands.js";

/**
 * Parent layout context driving the resolution. Derived from the parent's
 * computed `display` + `flex-direction`:
 * - `flex-row` — `display: flex; flex-direction: row` (main axis = horizontal).
 * - `flex-column` — `display: flex; flex-direction: column` (main axis = vertical).
 * - `block` — `display: block` (or `list-item`, `flow-root`).
 * - `grid` — `display: grid`.
 */
export const SIZING_PARENT_CONTEXTS = ["flex-row", "flex-column", "block", "grid"] as const;
export type SizingParentContext = (typeof SIZING_PARENT_CONTEXTS)[number];

/** A single CSS property/value pair in the resolution. */
export interface CssDeclaration {
  readonly property: string;
  readonly value: string;
}

/**
 * One resolved sizing strategy. A strategy may carry multiple declarations
 * because Hug/Fill in flex contexts needs BOTH a flex shorthand AND an explicit
 * sizing keyword (e.g. `flex: 0 0 auto` + `width: max-content`). This is why
 * Hug is NOT one CSS property — it is a combination that depends on context.
 */
export interface SizingResolution {
  readonly intent: ChildSizingIntent;
  readonly parentContext: SizingParentContext;
  readonly declarations: readonly CssDeclaration[];
  readonly rationale: string;
  /** Which axis the resolution targets. `main` = flex direction, `cross` = perpendicular, `both` = block. */
  readonly axis: "main" | "cross" | "both";
}

/**
 * Result of resolving a sizing intent. `resolved: false` signals an unsupported
 * context (inline/unknown) — the caller surfaces a diagnostic and MUST NOT
 * produce invalid CSS.
 */
export type SizingResolutionResult =
  | { readonly resolved: true; readonly resolution: SizingResolution }
  | {
      readonly resolved: false;
      readonly diagnostic: "unsupported-context";
      readonly message: string;
    };

/** Input to the resolver. */
export interface SizingResolutionInput {
  readonly intent: ChildSizingIntent;
  readonly parentContext: SizingParentContext;
  /** Required for `intent: "fixed"`; ignored otherwise. E.g. `"200px"`, `"12rem"`. */
  readonly fixedValue?: string;
}

/**
 * Extended parent context including unsupported roles. Used by the safe wrapper
 * {@link tryResolveHugFillFixed} which must accept inline/unknown contexts and
 * return a diagnostic instead of throwing.
 */
export type ExtendedSizingParentContext = SizingParentContext | "inline" | "unknown";

/** Input to the safe wrapper. */
export interface SafeSizingResolutionInput {
  readonly intent: ChildSizingIntent;
  readonly parentContext: ExtendedSizingParentContext;
  readonly fixedValue?: string;
}

const validateFixedValue = (value: string | undefined): string => {
  if (value === undefined || value.trim() === "") {
    throw new Error('fixed sizing intent requires a non-empty "fixedValue"');
  }
  return value;
};

// ── Hug ──────────────────────────────────────────────────────────────────────

const hugFlexRow = (): SizingResolution => ({
  intent: "hug",
  parentContext: "flex-row",
  axis: "main",
  declarations: [
    { property: "flex", value: "0 0 auto" },
    { property: "width", value: "max-content" },
  ],
  rationale:
    "hug on a flex-row item: flex-basis auto + width max-content shrink-wraps along the horizontal main axis",
});

const hugFlexColumn = (): SizingResolution => ({
  intent: "hug",
  parentContext: "flex-column",
  axis: "main",
  declarations: [
    { property: "flex", value: "0 0 auto" },
    { property: "height", value: "max-content" },
  ],
  rationale:
    "hug on a flex-column item: flex-basis auto + height max-content shrink-wraps along the vertical main axis",
});

const hugBlock = (): SizingResolution => ({
  intent: "hug",
  parentContext: "block",
  axis: "both",
  declarations: [{ property: "width", value: "fit-content" }],
  rationale:
    "hug on a block child: fit-content shrink-wraps to content without overflowing the parent",
});

const hugGrid = (): SizingResolution => ({
  intent: "hug",
  parentContext: "grid",
  axis: "main",
  declarations: [
    { property: "justify-self", value: "start" },
    { property: "width", value: "max-content" },
  ],
  rationale:
    "hug on a grid item: justify-self start + width max-content prevent the item from stretching to its cell",
});

// ── Fill ─────────────────────────────────────────────────────────────────────

const fillFlexRow = (): SizingResolution => ({
  intent: "fill",
  parentContext: "flex-row",
  axis: "main",
  declarations: [{ property: "flex", value: "1 1 0%" }],
  rationale:
    "fill on a flex-row item: flex-grow 1 with basis 0% distributes all horizontal free space to the item",
});

const fillFlexColumn = (): SizingResolution => ({
  intent: "fill",
  parentContext: "flex-column",
  axis: "main",
  declarations: [{ property: "flex", value: "1 1 0%" }],
  rationale:
    "fill on a flex-column item: flex-grow 1 with basis 0% distributes all vertical free space to the item",
});

const fillBlock = (): SizingResolution => ({
  intent: "fill",
  parentContext: "block",
  axis: "both",
  declarations: [{ property: "width", value: "100%" }],
  rationale: "fill on a block child: width 100% fills the parent's content box",
});

const fillGrid = (): SizingResolution => ({
  intent: "fill",
  parentContext: "grid",
  axis: "main",
  declarations: [
    { property: "justify-self", value: "stretch" },
    { property: "width", value: "100%" },
  ],
  rationale: "fill on a grid item: justify-self stretch + width 100% fill the grid cell",
});

// ── Fixed ────────────────────────────────────────────────────────────────────

const fixedFlexRow = (value: string): SizingResolution => ({
  intent: "fixed",
  parentContext: "flex-row",
  axis: "main",
  declarations: [
    { property: "flex", value: `0 0 ${value}` },
    { property: "width", value },
  ],
  rationale:
    "fixed on a flex-row item: flex-basis pinned to the explicit value (no grow, no shrink); width echoes it",
});

const fixedFlexColumn = (value: string): SizingResolution => ({
  intent: "fixed",
  parentContext: "flex-column",
  axis: "main",
  declarations: [
    { property: "flex", value: `0 0 ${value}` },
    { property: "height", value },
  ],
  rationale:
    "fixed on a flex-column item: flex-basis pinned to the explicit value; height echoes it",
});

const fixedBlock = (value: string): SizingResolution => ({
  intent: "fixed",
  parentContext: "block",
  axis: "both",
  declarations: [{ property: "width", value }],
  rationale: "fixed on a block child: width set to the explicit value",
});

const fixedGrid = (value: string): SizingResolution => ({
  intent: "fixed",
  parentContext: "grid",
  axis: "main",
  declarations: [{ property: "width", value }],
  rationale: "fixed on a grid item: width set to the explicit value within its cell",
});

// ── Dispatch table ───────────────────────────────────────────────────────────

const HUG_TABLE: Record<SizingParentContext, () => SizingResolution> = {
  "flex-row": hugFlexRow,
  "flex-column": hugFlexColumn,
  block: hugBlock,
  grid: hugGrid,
};

const FILL_TABLE: Record<SizingParentContext, () => SizingResolution> = {
  "flex-row": fillFlexRow,
  "flex-column": fillFlexColumn,
  block: fillBlock,
  grid: fillGrid,
};

const FIXED_TABLE: Record<SizingParentContext, (value: string) => SizingResolution> = {
  "flex-row": fixedFlexRow,
  "flex-column": fixedFlexColumn,
  block: fixedBlock,
  grid: fixedGrid,
};

/**
 * Resolve a Hug/Fill/Fixed intent to concrete CSS declarations based on the
 * parent layout context.
 *
 * - Hug (shrink-wrap): `flex: 0 0 auto` + `width: max-content` (flex-row),
 *   `flex: 0 0 auto` + `height: max-content` (flex-column), `width: fit-content`
 *   (block), `justify-self: start` + `width: max-content` (grid).
 * - Fill (grow to parent): `flex: 1 1 0%` (flex), `width: 100%` (block),
 *   `justify-self: stretch` + `width: 100%` (grid).
 * - Fixed: `flex: 0 0 <value>` + `width/height: <value>` (flex), `width: <value>`
 *   (block/grid).
 *
 * Throws when `intent: "fixed"` is given without a `fixedValue`. This is a
 * programming error (the panel must always supply a value for Fixed), not a
 * malformed-input path.
 */
export const resolveHugFillFixed = (input: SizingResolutionInput): SizingResolution => {
  if (input.intent === "hug") return HUG_TABLE[input.parentContext]();
  if (input.intent === "fill") return FILL_TABLE[input.parentContext]();
  return FIXED_TABLE[input.parentContext](validateFixedValue(input.fixedValue));
};

/**
 * Safe wrapper that never throws. Returns a diagnostic result for inline/unknown
 * parent contexts or a missing fixed value. Use this when the caller cannot
 * guarantee a valid context (e.g. an inline element selected by accident).
 */
export const tryResolveHugFillFixed = (
  input: SafeSizingResolutionInput,
): SizingResolutionResult => {
  if (input.parentContext === "inline" || input.parentContext === "unknown") {
    return {
      resolved: false,
      diagnostic: "unsupported-context",
      message: `sizing intent is not applicable to a "${input.parentContext}" parent context`,
    };
  }
  if (
    input.intent === "fixed" &&
    (input.fixedValue === undefined || input.fixedValue.trim() === "")
  ) {
    return {
      resolved: false,
      diagnostic: "unsupported-context",
      message: "fixed sizing intent requires a non-empty value",
    };
  }
  return {
    resolved: true,
    resolution: resolveHugFillFixed({
      intent: input.intent,
      parentContext: input.parentContext,
      ...(input.fixedValue !== undefined ? { fixedValue: input.fixedValue } : {}),
    }),
  };
};
