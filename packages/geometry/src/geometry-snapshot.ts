import { type ElementRef, ElementRefSchema } from "@vision-control/element-identity";
import { z } from "zod";

import { type Matrix2D, Matrix2DSchema } from "./matrix.js";
import { type Point, PointSchema } from "./point.js";
import { type Rect, RectSchema } from "./rect.js";

/**
 * A fully JSON-safe geometry snapshot of a single element. Captured by the
 * inspector (task 15) and asserted against by the verification engine
 * (task 26). All fields are plain numbers/strings/arrays so the snapshot
 * round-trips through `JSON.parse(JSON.stringify(...))`, crosses the protocol
 * wire, and persists in SQLite unchanged.
 *
 * - `target` — the element this snapshot describes.
 * - `borderRect`/`paddingRect`/`contentRect` — the box-model rects in client
 *   coordinates. `marginRect` is optional (margins collapse, so it may be
 *   omitted when not meaningful).
 * - `transform` — the composed 2D transform matrix, if any.
 * - `transformOrigin` — the CSS `transform-origin` pivot (in element-local
 *   coordinates) the transform composes around. Fed to `clientToLocal` /
 *   `localToClient`. Defaults to `{0,0}` (identity-preserving); the browser
 *   adapter populates the real computed value.
 * - `scrollOffset` — accumulated scroll offset of the containing scroll parents.
 * - `viewportSize` — the visible viewport dimensions at capture time.
 * - `devicePixelRatio` — `window.devicePixelRatio` at capture time. Feeds the
 *   device-pixel coordinate conversions (`cssToDevicePixel` /
 *   `devicePixelToCss`) used for screenshot alignment. Defaults to `1`.
 * - `capturedAt` — epoch milliseconds when the snapshot was taken.
 */
export const GeometrySnapshotSchema = z.object({
  target: ElementRefSchema,
  borderRect: RectSchema,
  paddingRect: RectSchema,
  contentRect: RectSchema,
  marginRect: RectSchema.optional(),
  transform: Matrix2DSchema.optional(),
  transformOrigin: PointSchema.default({ x: 0, y: 0 }),
  scrollOffset: PointSchema,
  viewportSize: PointSchema,
  devicePixelRatio: z.number().positive().default(1),
  capturedAt: z.number().int().nonnegative(),
});

export type GeometrySnapshot = {
  readonly target: ElementRef;
  readonly borderRect: Rect;
  readonly paddingRect: Rect;
  readonly contentRect: Rect;
  readonly marginRect?: Rect;
  readonly transform?: Matrix2D;
  readonly transformOrigin: Point;
  readonly scrollOffset: Point;
  readonly viewportSize: Point;
  readonly devicePixelRatio: number;
  readonly capturedAt: number;
};
