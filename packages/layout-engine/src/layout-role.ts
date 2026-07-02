import { z } from "zod";

/**
 * Layout role of a single element (PRD section 9.5). The interaction machine
 * and the resize engine branch on this value rather than re-inspecting raw
 * computed-style strings. The union is deliberately small and MVP-scoped: grid
 * span editing, replaced-element intrinsic sizing, and SVG are out of scope.
 *
 * Position-bearing roles (`absolute`, `fixed`, `sticky`) are distinguished
 * because they form a free-move / out-of-flow context — PRD constraint 2
 * forbids collapsing a normal-flow drag into an `absolute` source intent.
 */
export const LAYOUT_ROLES = [
  "flex-row",
  "flex-column",
  "block",
  "inline",
  "inline-block",
  "grid",
  "absolute",
  "fixed",
  "sticky",
  "table-cell",
  "unknown",
] as const;

export type LayoutRole = (typeof LAYOUT_ROLES)[number];

export const LayoutRoleSchema = z.enum(LAYOUT_ROLES);

/**
 * Pure computed-style view of an element. The caller (an inspector in a browser
 * package) supplies this; this package NEVER reads `getComputedStyle`. All
 * string values are normalized internally.
 *
 * - `display` — the element's `display` (e.g. `"flex"`, `"grid"`, `"block"`,
 *   `"inline"`, `"inline-block"`, `"list-item"`, `"table-cell"`).
 * - `flexDirection` — meaningful only when `display === "flex"`; otherwise
 *   ignored. `"row"` / `"row-reverse"` → horizontal; `"column"` /
 *   `"column-reverse"` → vertical.
 * - `position` — `"static"` | `"relative"` | `"absolute"` | `"fixed"` |
 *   `"sticky"`.
 * - `parentDisplay` — the parent's `display`. Used by the resize engine to
 *   detect flex items (a block child of a flex container is a flex item).
 */
export interface LayoutComputedStyle {
  readonly display: string;
  readonly flexDirection: string;
  readonly position: string;
  readonly parentDisplay?: string;
}

const normalize = (value: string): string => value.trim().toLowerCase();

/**
 * Classify an element's computed style into a {@link LayoutRole}.
 *
 * Position takes precedence: `absolute`/`fixed`/`sticky` form out-of-flow or
 * sticky contexts that change the drag/resize semantics regardless of the
 * element's box type. `relative` is in-flow and falls through to display-based
 * classification.
 */
export const classifyLayoutRole = (computedStyle: LayoutComputedStyle): LayoutRole => {
  const position = normalize(computedStyle.position);
  if (position === "absolute") return "absolute";
  if (position === "fixed") return "fixed";
  if (position === "sticky") return "sticky";

  const display = normalize(computedStyle.display);
  if (display === "flex") {
    const direction = normalize(computedStyle.flexDirection);
    return direction.startsWith("column") ? "flex-column" : "flex-row";
  }
  if (display === "grid") return "grid";
  if (display === "table-cell") return "table-cell";
  if (display === "inline-block") return "inline-block";
  if (display === "inline") return "inline";
  if (display === "block" || display === "list-item" || display === "flow-root") return "block";
  return "unknown";
};

/** True for roles that live in normal document flow (not out-of-flow). */
export const isNormalFlowRole = (role: LayoutRole): boolean =>
  role !== "absolute" && role !== "fixed" && role !== "sticky" && role !== "unknown";

/** True for flex container roles (the element itself is a flex container). */
export const isFlexContainerRole = (role: LayoutRole): boolean =>
  role === "flex-row" || role === "flex-column";
