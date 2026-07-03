export {
  clientToFrameLocal,
  clientToLocal,
  clientToOffsetParent,
  clientToViewport,
  cssToDevicePixel,
  devicePixelToCss,
  frameLocalToClient,
  localToClient,
  offsetParentToClient,
  pageToClient,
  viewportToClient,
} from "./coordinate-conversion.js";
export { type GeometrySnapshot, GeometrySnapshotSchema } from "./geometry-snapshot.js";
export {
  applyToPoint,
  type DecomposedMatrix,
  decompose,
  fromString,
  identity,
  invert,
  MalformedTransformError,
  type Matrix2D,
  Matrix2DSchema,
  multiply,
  rotate,
  scale,
  translate,
  UnsupportedTransformError,
} from "./matrix.js";
export {
  add,
  DEFAULT_POINT_TOLERANCE,
  distance,
  equals,
  type Point,
  PointSchema,
  subtract,
} from "./point.js";
export {
  DEFAULT_RECT_TOLERANCE,
  type DomRectLike,
  type Rect,
  RectSchema,
  rectCenter,
  rectContains,
  rectEquals,
  rectFromDomRect,
  rectIntersects,
} from "./rect.js";
export { accumulateScrollOffset, type ScrollParent } from "./scroll-parents.js";
