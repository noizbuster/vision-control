import type { Rect } from "@vision-control/geometry";

/**
 * Grid track geometry. Each entry is the pixel offset of a grid line (1-based
 * line N is at `lines[N - 1]`). For a grid with `columns` tracks,
 * `columnLines.length === columns + 1`. Pure data — the caller (a browser
 * inspector) supplies this from `getComputedStyle`; this package never reads
 * the DOM.
 *
 * PRD section 9.3 "Grid": grid cell rectangle estimation + explicit grid line
 * or nearest cell computation.
 */
export interface GridTrackInfo {
  /** Pixel x-offset of each column grid line. `length === columns + 1`. */
  readonly columnLines: readonly number[];
  /** Pixel y-offset of each row grid line. `length === rows + 1`. */
  readonly rowLines: readonly number[];
}

/**
 * A grid child's measured rect (in grid-container-local coordinates) plus any
 * explicit `grid-column` / `grid-row` line values parsed from computed style.
 * Line numbers are 1-based CSS grid lines.
 */
export interface GridChildPlacementInput {
  readonly rect: Rect;
  /** Explicit `grid-column-start` line (1-based), if set in computed style. */
  readonly gridColumnStart?: number;
  /** Explicit `grid-column-end` line (1-based), if set in computed style. */
  readonly gridColumnEnd?: number;
  /** Explicit `grid-row-start` line (1-based), if set in computed style. */
  readonly gridRowStart?: number;
  /** Explicit `grid-row-end` line (1-based), if set in computed style. */
  readonly gridRowEnd?: number;
}

/**
 * A resolved grid cell placement. `column`/`row` are 1-based start lines;
 * `columnEnd`/`rowEnd` are the exclusive end lines (CSS convention:
 * `columnEnd - column === columnSpan`).
 */
export interface GridCellPlacement {
  readonly row: number;
  readonly column: number;
  readonly rowEnd: number;
  readonly columnEnd: number;
  readonly rowSpan: number;
  readonly columnSpan: number;
  readonly rect: Rect;
}

const lineCount = (lines: readonly number[]): number => Math.max(0, lines.length - 1);

/**
 * Resolve an explicit start/end pair into a clamped `{ start, end }`. End is
 * exclusive (CSS grid-line convention). Missing end defaults to start + 1
 * (span 1). Both are clamped to `[1, tracks + 1]`. Returns `null` when there
 * are no tracks.
 */
const resolveExplicit = (
  start: number | undefined,
  end: number | undefined,
  maxLine: number,
): { readonly start: number; readonly end: number } | null => {
  if (maxLine < 2) return null;
  const startLine = start === undefined ? 1 : Math.max(1, Math.min(start, maxLine));
  // CSS allows `grid-column: 1 / span 2`; here the caller pre-converts span
  // to an absolute end line. A missing or invalid end falls back to span 1.
  const rawEnd = end === undefined || end <= startLine ? startLine + 1 : end;
  const endLine = Math.min(Math.max(rawEnd, startLine + 1), maxLine);
  return { start: startLine, end: endLine };
};

/**
 * Find the line index (1-based start line) whose track range contains `coord`,
 * searching along the given line offsets. Returns a value in `[1, lineCount]`.
 * Clamps out-of-range coordinates to the nearest cell. Returns `null` only when
 * there are fewer than 2 lines (no tracks).
 */
const lineAt = (coord: number, lines: readonly number[]): number | null => {
  const tracks = lineCount(lines);
  if (tracks < 1) return null;
  const clamped = Math.max(lines[0] ?? 0, Math.min(coord, lines[tracks] ?? coord));
  for (let line = 1; line <= tracks; line += 1) {
    const start = lines[line - 1];
    const end = lines[line];
    if (start === undefined || end === undefined) continue;
    if (clamped >= start && clamped < end) return line;
  }
  return tracks;
};

/**
 * Compute the span (in tracks) covered by a rect along one axis, starting from
 * `startLine`. The span is the count of tracks the rect overlaps, at least 1.
 */
const spanFor = (
  rectStart: number,
  rectEnd: number,
  lines: readonly number[],
  startLine: number,
): number => {
  const tracks = lineCount(lines);
  if (tracks < 1) return 1;
  let span = 0;
  for (let line = startLine; line <= tracks; line += 1) {
    const trackStart = lines[line - 1];
    const trackEnd = lines[line];
    if (trackStart === undefined || trackEnd === undefined) break;
    // A track counts toward the span if the rect overlaps it.
    if (rectEnd > trackStart && rectStart < trackEnd) {
      span += 1;
    } else if (span > 0) {
      break;
    }
  }
  return Math.max(1, span);
};

/**
 * Infer grid cell placements for each child (PRD section 9.3 "Grid").
 *
 * For children with explicit `grid-column` / `grid-row` line values, those
 * lines are used directly (clamped to the declared tracks). For auto-placed
 * children (no explicit lines), the child's measured rect is matched against
 * the track geometry to find the starting cell and span.
 *
 * The returned array is parallel to the input `children` and preserves DOM
 * order — this is the reading-order source of truth for the accessibility
 * comparison in {@link ./grid-intent.ts}.
 */
export const inferGridCells = (
  tracks: GridTrackInfo,
  children: readonly GridChildPlacementInput[],
): readonly GridCellPlacement[] => {
  if (children.length === 0) return [];
  const maxColumnLine = tracks.columnLines.length;
  const maxRowLine = tracks.rowLines.length;
  if (maxColumnLine < 2 || maxRowLine < 2) return [];

  return children.map((child): GridCellPlacement => {
    const explicitCol =
      child.gridColumnStart !== undefined || child.gridColumnEnd !== undefined
        ? resolveExplicit(child.gridColumnStart, child.gridColumnEnd, maxColumnLine)
        : null;
    const explicitRow =
      child.gridRowStart !== undefined || child.gridRowEnd !== undefined
        ? resolveExplicit(child.gridRowStart, child.gridRowEnd, maxRowLine)
        : null;

    const column = explicitCol?.start ?? lineAt(child.rect.x, tracks.columnLines) ?? 1;
    const row = explicitRow?.start ?? lineAt(child.rect.y, tracks.rowLines) ?? 1;

    const columnEnd =
      explicitCol?.end ??
      column + spanFor(child.rect.x, child.rect.x + child.rect.width, tracks.columnLines, column);
    const rowEnd =
      explicitRow?.end ??
      row + spanFor(child.rect.y, child.rect.y + child.rect.height, tracks.rowLines, row);

    return {
      row,
      column,
      rowEnd,
      columnEnd,
      rowSpan: rowEnd - row,
      columnSpan: columnEnd - column,
      rect: child.rect,
    };
  });
};
