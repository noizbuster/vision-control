/**
 * Grid-placement controller (plan task 4).
 *
 * On selection of a CSS-Grid child, derives the grid track geometry from the
 * parent's computed style, infers the child's cell via {@link inferGridCells},
 * builds span candidates, and publishes a `grid-placement` panel message so the
 * `useGridPlacement` hook fills the V1V2 InspectorPanel grid slot (the slot was
 * subscribed but never fed — `createGridPlacementMessage` had zero callers).
 *
 * Non-grid selections publish nothing (the panel hook retains its last value —
 * same stale-display trade-off as the multi-select hook; the runtime's own
 * state is always correct, see plan task 2 learnings). `reorderChoice` is
 * `null` on selection (the candidate set is drag-driven); the panel's
 * `handleGridChoosePlacement` / `handleGridResizeSpan` handlers stop
 * short-circuiting as soon as a non-null `gridPlacementState` arrives.
 *
 * Track geometry is read purely from `getComputedStyle` (browser-resolved px
 * track sizes + gaps) and `getBoundingClientRect`. No layout engine, no DOM
 * mutation beyond stamping the dev-only `data-vc-preview-id` attribute used as
 * the shared element-identity key by the preview engine and reorder controller.
 */

import type { ElementRef } from "@vision-control/element-identity";
import {
  type GridChildPlacementInput,
  type GridTrackInfo,
  generateGridSpanCandidates,
  inferGridCells,
} from "@vision-control/layout-engine";
import { PREVIEW_ID_ATTR } from "@vision-control/preview-engine";

import { createGridPlacementMessage } from "../messaging/panel-messages.js";
import type { BusMessage, BusRoute } from "../messaging/types.js";

/** Narrow bus seam: only `send` is needed to publish panel messages. */
export interface GridPlacementControllerBus {
  readonly send: (route: BusRoute, message: BusMessage) => void;
}

export interface GridPlacementControllerOptions {
  readonly bus: GridPlacementControllerBus;
}

export interface GridPlacementController {
  /** Called on selection. Publishes `grid-placement` when the element is a grid child. */
  readonly onSelection: (element: Element) => void;
  readonly reset: () => void;
  readonly dispose: () => void;
}

const PX_RE = /^([0-9.]+)px$/;
const SPAN_RE = /^span\s+([0-9]+)$/;

const parsePx = (value: string): number => {
  const match = PX_RE.exec(value.trim());
  return match ? Number.parseFloat(match[1] ?? "0") : 0;
};

/**
 * Parse a computed `grid-template-{columns,rows}` value into explicit track
 * sizes. The browser resolves `fr`/`auto`/`minmax` to used px in the computed
 * value, so every track token is a `<length>px`. Non-px tokens (a defensive
 * fallback for `none`/unresolved values) are skipped.
 */
const parsePxTrackList = (value: string): readonly number[] => {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "none") return [];
  const tracks: number[] = [];
  for (const token of trimmed.split(/\s+/)) {
    const match = PX_RE.exec(token);
    if (match) tracks.push(Number.parseFloat(match[1] ?? "0"));
  }
  return tracks;
};

/** Accumulate grid line offsets from an origin along a track list with gaps. */
const accumulateLines = (
  origin: number,
  tracks: readonly number[],
  gap: number,
): readonly number[] => {
  const lines: number[] = [origin];
  let cursor = origin;
  for (let i = 0; i < tracks.length; i += 1) {
    cursor += tracks[i] ?? 0;
    lines.push(cursor);
    if (i < tracks.length - 1) cursor += gap;
  }
  return lines;
};

/** Parse an explicit grid line (1-based). `auto`/unparseable -> undefined. */
const parseGridLine = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "auto") return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Parse a grid line end, converting `span N` to an absolute line off `start`. */
const parseGridLineEnd = (value: string, start: number | undefined): number | undefined => {
  const trimmed = value.trim();
  const spanMatch = SPAN_RE.exec(trimmed);
  if (spanMatch !== null && start !== undefined) {
    return start + Number.parseInt(spanMatch[1] ?? "1", 10);
  }
  return parseGridLine(trimmed);
};

/**
 * Derive the grid track geometry in viewport coordinates. Returns `null` when
 * the parent is not `display: grid` or has no resolvable explicit tracks.
 */
const computeGridTracks = (parent: Element): GridTrackInfo | null => {
  const win = parent.ownerDocument.defaultView ?? window;
  const style = win.getComputedStyle(parent);
  if (style.display !== "grid") return null;
  const columnTracks = parsePxTrackList(style.gridTemplateColumns);
  const rowTracks = parsePxTrackList(style.gridTemplateRows);
  if (columnTracks.length === 0 || rowTracks.length === 0) return null;
  const box = parent.getBoundingClientRect();
  const originX = box.left + parsePx(style.paddingLeft) + parsePx(style.borderLeftWidth);
  const originY = box.top + parsePx(style.paddingTop) + parsePx(style.borderTopWidth);
  return {
    columnLines: accumulateLines(originX, columnTracks, parsePx(style.columnGap)),
    rowLines: accumulateLines(originY, rowTracks, parsePx(style.rowGap)),
  };
};

/** Build the inference input from the child's measured rect + explicit grid lines. */
const buildChildInput = (element: Element): GridChildPlacementInput => {
  const win = element.ownerDocument.defaultView ?? window;
  const style = win.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const columnStart = parseGridLine(style.gridColumnStart);
  const columnEnd = parseGridLineEnd(style.gridColumnEnd, columnStart);
  const rowStart = parseGridLine(style.gridRowStart);
  const rowEnd = parseGridLineEnd(style.gridRowEnd, rowStart);
  return {
    rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    ...(columnStart !== undefined ? { gridColumnStart: columnStart } : {}),
    ...(columnEnd !== undefined ? { gridColumnEnd: columnEnd } : {}),
    ...(rowStart !== undefined ? { gridRowStart: rowStart } : {}),
    ...(rowEnd !== undefined ? { gridRowEnd: rowEnd } : {}),
  };
};

export function createGridPlacementController(
  options: GridPlacementControllerOptions,
): GridPlacementController {
  const { bus } = options;

  const ensurePreviewId = (element: Element): string => {
    const existing = element.getAttribute(PREVIEW_ID_ATTR);
    if (existing !== null) return existing;
    const id = `vc-grid-${crypto.randomUUID()}`;
    element.setAttribute(PREVIEW_ID_ATTR, id);
    return id;
  };

  const toElementRef = (element: Element): ElementRef => ({
    runtimeId: ensurePreviewId(element),
    tagName: element.tagName.toLowerCase(),
  });

  const onSelection = (element: Element): void => {
    const parent = element.parentElement;
    if (parent === null) return;
    const tracks = computeGridTracks(parent);
    if (tracks === null) return; // not a grid child -> publish nothing (no crash).

    const cells = inferGridCells(tracks, [buildChildInput(element)]);
    const placement = cells[0] ?? null;
    const spanCandidates = placement !== null ? generateGridSpanCandidates(placement, tracks) : [];

    bus.send(
      "panel",
      createGridPlacementMessage({
        gridContainer: toElementRef(parent),
        child: toElementRef(element),
        placement,
        spanCandidates,
        reorderChoice: null,
        a11yWarning: null,
      }),
    );
  };

  const reset = (): void => {};
  const dispose = (): void => {};

  return { onSelection, reset, dispose };
}
