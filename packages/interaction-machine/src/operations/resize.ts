import type { ElementRef, ResizeElementOperation, ResizeProperty } from "@vision-control/change-ir";
import type { Point, Rect } from "@vision-control/geometry";
import type { ResizeHandle } from "../events.js";
import type { PointerId } from "../pointer-ownership.js";

/** Internal phase of a single resize gesture. */
export type ResizePhase = "idle" | "resize-pending" | "resizing" | "ended";

/** Modifier keys active during a resize update. */
export interface ResizeModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
}

/** Which axis a resize property maps to for pointer-delta interpretation. */
export type ResizeAxis = "x" | "y";

/** Target description supplied when a resize gesture begins. */
export interface ResizeTarget {
  /** The element being resized. */
  readonly element: ElementRef;
  /** The CSS property the user chose to resize. */
  readonly property: ResizeProperty;
  /** Whether the property is driven by horizontal or vertical drag. */
  readonly axis: ResizeAxis;
  /** Starting numeric value of the property. */
  readonly fromValue: number;
  /** CSS unit for the property (px, rem, etc.). Unitless properties use "". */
  readonly unit: string;
  /** Bounding rect of the element at resize start. */
  readonly rect: Rect;
}

/** Preview value emitted during an active resize gesture. */
export interface ResizePreview {
  readonly property: ResizeProperty;
  readonly value: number;
  readonly unit: string;
}

/** Result of a completed resize gesture. */
export interface ResizeResult {
  readonly operation: ResizeElementOperation;
}

interface ResizeState {
  phase: ResizePhase;
  handle: ResizeHandle | null;
  pointerId: PointerId | null;
  target: ResizeTarget | null;
  currentDelta: Point;
  preview: ResizePreview | null;
}

const RESIZE_THRESHOLD_PX = 1;

const isCornerHandle = (handle: ResizeHandle): boolean =>
  handle === "nw" || handle === "ne" || handle === "sw" || handle === "se";

const horizontalHandles: readonly ResizeHandle[] = ["e", "w", "ne", "nw", "se", "sw"];
const verticalHandles: readonly ResizeHandle[] = ["n", "s", "ne", "nw", "se", "sw"];

const handleAffectsAxis = (handle: ResizeHandle, axis: ResizeAxis): boolean => {
  if (axis === "x") return horizontalHandles.includes(handle);
  return verticalHandles.includes(handle);
};

const axisDelta = (handle: ResizeHandle, delta: Point, axis: ResizeAxis): number => {
  if (axis === "x") {
    // Right-side and bottom-right/top-right handles increase width with positive dx.
    // Left-side handles increase width with negative dx (dragging left edge left).
    if (handle === "e" || handle === "ne" || handle === "se") return delta.x;
    if (handle === "w" || handle === "nw" || handle === "sw") return -delta.x;
    return 0;
  }
  // Bottom handles increase height with positive dy.
  // Top handles increase height with negative dy.
  if (handle === "s" || handle === "se" || handle === "sw") return delta.y;
  if (handle === "n" || handle === "ne" || handle === "nw") return -delta.y;
  return 0;
};

/**
 * Compute the aspect-locked delta for the target property's axis from movement
 * on the orthogonal axis. Signs are chosen so that dragging a corner outward
 * (away from the center) always increases the target dimension.
 */
const applyAspectLock = (
  handle: ResizeHandle,
  target: ResizeTarget,
  deltaX: number,
  deltaY: number,
): number => {
  if (!isCornerHandle(handle) || target.rect.width === 0 || target.rect.height === 0) {
    return 0;
  }
  const aspect = target.rect.width / target.rect.height;
  if (target.axis === "x") {
    const sign = handle === "nw" || handle === "ne" ? -1 : 1;
    return deltaY * aspect * sign;
  }
  const sign = handle === "nw" || handle === "sw" ? -1 : 1;
  return (deltaX / aspect) * sign;
};

const computePreviewValue = (
  handle: ResizeHandle,
  target: ResizeTarget,
  delta: Point,
  modifiers: ResizeModifiers,
): number => {
  if (!handleAffectsAxis(handle, target.axis)) {
    return target.fromValue;
  }

  let effectiveDelta = axisDelta(handle, delta, target.axis);

  if (modifiers.shift && isCornerHandle(handle)) {
    const lockedDelta = applyAspectLock(handle, target, delta.x, delta.y);
    // Use the delta that produces the larger absolute change, keeping sign.
    effectiveDelta =
      Math.abs(effectiveDelta) >= Math.abs(lockedDelta) ? effectiveDelta : lockedDelta;
  }

  if (modifiers.alt) {
    effectiveDelta *= 2;
  }

  const next = target.fromValue + effectiveDelta;
  return Number.isFinite(next) ? next : target.fromValue;
};

const newOperationId = (): string => crypto.randomUUID();

const buildOperation = (target: ResizeTarget, preview: ResizePreview): ResizeElementOperation => ({
  id: newOperationId(),
  timestamp: Date.now(),
  runtime: false,
  origin: "canvas-drag",
  confidence: 1,
  kind: "resize-element",
  element: target.element,
  property: target.property,
  fromValue: String(target.fromValue),
  toValue: String(preview.value),
  unit: target.unit,
});

const magnitude = (delta: Point): number => Math.sqrt(delta.x * delta.x + delta.y * delta.y);

export interface ResizeOperation {
  /** Current phase of the resize lifecycle. */
  readonly getPhase: () => ResizePhase;
  /** Begin a resize gesture from a handle. Throws if already active. */
  readonly beginResize: (handle: ResizeHandle, pointerId: PointerId, target: ResizeTarget) => void;
  /** Update the drag delta and modifiers. Returns the current preview value. */
  readonly updateResize: (
    deltaX: number,
    deltaY: number,
    modifiers: ResizeModifiers,
  ) => ResizePreview | null;
  /** End the gesture and return the resize-element operation. */
  readonly endResize: () => ResizeResult | null;
}

/** Create a new resize operation with its own internal state. */
export function createResizeOperation(): ResizeOperation {
  const state: ResizeState = {
    phase: "idle",
    handle: null,
    pointerId: null,
    target: null,
    currentDelta: { x: 0, y: 0 },
    preview: null,
  };

  const getPhase = (): ResizePhase => state.phase;

  const beginResize = (handle: ResizeHandle, pointerId: PointerId, target: ResizeTarget): void => {
    if (state.phase !== "idle") {
      throw new Error(`beginResize: cannot begin from phase ${state.phase}`);
    }
    state.phase = "resize-pending";
    state.handle = handle;
    state.pointerId = pointerId;
    state.target = target;
    state.currentDelta = { x: 0, y: 0 };
    state.preview = null;
  };

  const updateResize = (
    deltaX: number,
    deltaY: number,
    modifiers: ResizeModifiers,
  ): ResizePreview | null => {
    if (state.phase !== "resize-pending" && state.phase !== "resizing") {
      return null;
    }
    if (state.handle === null || state.target === null) {
      return null;
    }

    const delta: Point = { x: deltaX, y: deltaY };
    state.currentDelta = delta;

    if (state.phase === "resize-pending" && magnitude(delta) >= RESIZE_THRESHOLD_PX) {
      state.phase = "resizing";
    }

    const value = computePreviewValue(state.handle, state.target, delta, modifiers);
    const preview: ResizePreview = {
      property: state.target.property,
      value,
      unit: state.target.unit,
    };
    state.preview = preview;
    return preview;
  };

  const endResize = (): ResizeResult | null => {
    if (state.phase !== "resize-pending" && state.phase !== "resizing") {
      return null;
    }
    const { target, preview } = state;
    state.phase = "ended";
    state.handle = null;
    state.pointerId = null;
    state.target = null;
    state.preview = null;

    if (target === null || preview === null) {
      return null;
    }

    return { operation: buildOperation(target, preview) };
  };

  return { getPhase, beginResize, updateResize, endResize };
}
