import type { GridCellPlacement, GridTrackInfo } from "./grid-cell-inference.js";

/**
 * Axis a grid span resize targets. Mirrors the `axis` field of the change-ir
 * `grid-span` operation so a candidate maps directly onto a `GridSpanOperation`.
 */
export type GridSpanAxis = "column" | "row";

/**
 * A grid span resize candidate (PRD section 9.5 — `grid-column` / `grid-row`
 * span). `fromSpan`/`toSpan` are positive track counts; the change-ir
 * `GridSpanOperation` carries the same pair for a lossless inverse.
 */
export interface GridSpanCandidate {
  readonly axis: GridSpanAxis;
  readonly fromSpan: number;
  readonly toSpan: number;
  readonly rationale: string;
}

const lineCount = (lines: readonly number[]): number => Math.max(0, lines.length - 1);

/**
 * Generate `grid-column` / `grid-row` span resize candidates for a grid child
 * (PRD section 9.5). For each axis the child can:
 *
 * - grow by one track, when there is room before the grid's trailing edge
 *   (`columnEnd + 1 <= columns` / `rowEnd + 1 <= rows`), and
 * - shrink by one track, when the current span is greater than 1.
 *
 * Spans never drop below 1 and never extend past the declared grid edge. The
 * candidates align with the change-ir `GridSpanOperation` (`axis`,
 * `fromSpan`, `toSpan`) so the interaction layer builds the operation directly.
 */
export const generateGridSpanCandidates = (
  placement: GridCellPlacement,
  tracks: GridTrackInfo,
): readonly GridSpanCandidate[] => {
  const columns = lineCount(tracks.columnLines);
  const rows = lineCount(tracks.rowLines);
  if (columns < 1 || rows < 1) return [];

  const candidates: GridSpanCandidate[] = [];

  // Column span: grow when room remains to the right; shrink when span > 1.
  if (placement.columnEnd <= columns) {
    candidates.push({
      axis: "column",
      fromSpan: placement.columnSpan,
      toSpan: placement.columnSpan + 1,
      rationale: "grow grid-column span by one track",
    });
  }
  if (placement.columnSpan > 1) {
    candidates.push({
      axis: "column",
      fromSpan: placement.columnSpan,
      toSpan: placement.columnSpan - 1,
      rationale: "shrink grid-column span by one track",
    });
  }

  // Row span: grow when room remains below; shrink when span > 1.
  if (placement.rowEnd <= rows) {
    candidates.push({
      axis: "row",
      fromSpan: placement.rowSpan,
      toSpan: placement.rowSpan + 1,
      rationale: "grow grid-row span by one track",
    });
  }
  if (placement.rowSpan > 1) {
    candidates.push({
      axis: "row",
      fromSpan: placement.rowSpan,
      toSpan: placement.rowSpan - 1,
      rationale: "shrink grid-row span by one track",
    });
  }

  return candidates;
};
