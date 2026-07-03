import { z } from "zod";

/**
 * Layout role of a single element (PRD section 9.5). The interaction machine
 * and the resize engine branch on this value rather than re-inspecting raw
 * computed-style strings.
 *
 * The union is the CLOSED 12-value set mandated by PRD §9.5. The legacy names
 * (`flex-row`, `flex-column`, `block`, `absolute`, `fixed`, `sticky`,
 * `table-cell`, `grid`) are REMOVED — there is no aliasing and no coexistence
 * (binding R11: REPLACE, not extend).
 *
 * Flex direction is NOT encoded in the role: `flex-container` covers both row
 * and column. Callers that need the main-axis direction read
 * {@link LayoutComputedStyle.flexDirection}.
 *
 * Position-bearing roles (`absolute-positioned`, `fixed-positioned`) are
 * distinguished because they form an out-of-flow context — PRD constraint 2
 * forbids collapsing a normal-flow drag into an `absolute` source intent
 * (D41 guard). `sticky` is in-flow and is NOT a separate kind; it falls
 * through to display-based classification.
 */
export const LAYOUT_ROLES = [
  "normal-flow-block",
  "inline",
  "inline-block",
  "flex-container",
  "flex-item",
  "grid-container",
  "grid-item",
  "absolute-positioned",
  "fixed-positioned",
  "replaced-element",
  "svg-element",
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
 * - `flexDirection` — meaningful only when `display` is a flex value; otherwise
 *   ignored. `"row"` / `"row-reverse"` → horizontal main axis; `"column"` /
 *   `"column-reverse"` → vertical main axis.
 * - `position` — `"static"` | `"relative"` | `"absolute"` | `"fixed"` |
 *   `"sticky"`.
 * - `parentDisplay` — the parent's `display`. Used to classify an element as a
 *   `flex-item` (child of a flex container) or `grid-item` (child of a grid
 *   container) when the element itself is not a container.
 * - `tagName` — lowercase tag name (e.g. `"img"`, `"svg"`). Used to detect
 *   `replaced-element` (intrinsic sizing) and `svg-element` roles.
 */
export interface LayoutComputedStyle {
  readonly display: string;
  readonly flexDirection: string;
  readonly position: string;
  readonly parentDisplay?: string;
  readonly tagName?: string;
}

const normalize = (value: string): string => value.trim().toLowerCase();

/**
 * Tags whose layout role is `replaced-element`: they have intrinsic dimensions
 * and an aspect ratio that the resize engine must respect (PRD §9.5
 * "image intrinsic sizing").
 */
const REPLACED_ELEMENT_TAGS: ReadonlySet<string> = new Set([
  "img",
  "video",
  "audio",
  "canvas",
  "iframe",
  "embed",
  "object",
  "picture",
  "source",
  "input",
  "textarea",
  "select",
  "button",
]);

/**
 * Tags whose layout role is `svg-element`: the `<svg>` root and every SVG
 * child element. SVG uses its own coordinate system (viewBox); the resize
 * engine distinguishes it so callers can apply viewBox-aware sizing.
 */
const SVG_TAGS: ReadonlySet<string> = new Set([
  "svg",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "g",
  "defs",
  "use",
  "symbol",
  "text",
  "tspan",
  "clippath",
  "mask",
  "lineargradient",
  "radialgradient",
  "stop",
  "pattern",
  "image",
  "foreignobject",
  "title",
  "desc",
]);

const isFlexDisplay = (display: string): boolean => display === "flex" || display === "inline-flex";

const isGridDisplay = (display: string): boolean => display === "grid" || display === "inline-grid";

/**
 * Classify an element's computed style into a {@link LayoutRole} (PRD §9.5).
 *
 * Decision order (each rung is load-bearing):
 *
 * 1. **Replaced element** (tag-based) — `<img>`, `<video>`, `<canvas>`, etc.
 *    have intrinsic sizing that dominates regardless of position or display.
 * 2. **SVG element** (tag-based) — `<svg>` and SVG children use their own
 *    coordinate system.
 * 3. **Position** — `absolute`/`fixed` take the element out of flow and form a
 *    free-move context (D41 keys off this). `relative` and `sticky` are in-flow
 *    and fall through to display-based classification.
 * 4. **Container vs item** — `display: flex/grid` classifies the element as a
 *    `flex-container`/`grid-container`; otherwise a child of a flex/grid parent
 *    is classified as a `flex-item`/`grid-item`.
 * 5. **Display** — `block`, `list-item`, `flow-root`, table boxes →
 *    `normal-flow-block`; `inline-block` and `inline` are their own kinds.
 * 6. Anything else → `unknown`.
 */
export const classifyLayoutRole = (computedStyle: LayoutComputedStyle): LayoutRole => {
  const tag = normalize(computedStyle.tagName ?? "");
  if (REPLACED_ELEMENT_TAGS.has(tag)) return "replaced-element";
  if (SVG_TAGS.has(tag)) return "svg-element";

  const position = normalize(computedStyle.position);
  if (position === "absolute") return "absolute-positioned";
  if (position === "fixed") return "fixed-positioned";

  const display = normalize(computedStyle.display);
  if (isFlexDisplay(display)) return "flex-container";
  if (isGridDisplay(display)) return "grid-container";

  const parentDisplay = normalize(computedStyle.parentDisplay ?? "");
  if (isFlexDisplay(parentDisplay)) return "flex-item";
  if (isGridDisplay(parentDisplay)) return "grid-item";

  if (display === "inline-block") return "inline-block";
  if (display === "inline") return "inline";
  if (
    display === "block" ||
    display === "list-item" ||
    display === "flow-root" ||
    display === "table-cell" ||
    display === "table" ||
    display === "table-row" ||
    display === "table-row-group"
  ) {
    return "normal-flow-block";
  }

  return "unknown";
};

/**
 * True for roles that live in normal document flow (not out-of-flow).
 * `absolute-positioned`, `fixed-positioned`, and `unknown` are excluded. Every
 * other role — including `replaced-element` and `svg-element` — participates in
 * normal flow unless it is also positioned.
 */
export const isNormalFlowRole = (role: LayoutRole): boolean =>
  role !== "absolute-positioned" && role !== "fixed-positioned" && role !== "unknown";

/** True for the flex-container role (the element itself is a flex container). */
export const isFlexContainerRole = (role: LayoutRole): boolean => role === "flex-container";

/** True for grid roles (either a grid container or a grid item). */
export const isGridRole = (role: LayoutRole): boolean =>
  role === "grid-container" || role === "grid-item";
