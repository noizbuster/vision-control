import type {
  GridCellPlacement,
  GridReorderCandidateSet,
  GridSpanCandidate,
} from "@vision-control/layout-engine";
import type { ReactElement } from "react";

interface GridPanelProps {
  readonly placement: GridCellPlacement | null;
  readonly spanCandidates: readonly GridSpanCandidate[];
  readonly reorderChoice: GridReorderCandidateSet | null;
  readonly a11yWarning: string | null;
  readonly onChoosePlacement: (choice: "dom-order" | "grid-area") => void;
  readonly onResizeSpan: (axis: "column" | "row", toSpan: number) => void;
}

function PlacementRow({ placement }: { readonly placement: GridCellPlacement }): ReactElement {
  return (
    <div className="inspector-semantic">
      <div className="inspector-semantic__row">
        <span className="inspector-semantic__label">Cell</span>
        <span className="inspector-semantic__value">
          row {placement.row} / col {placement.column}
        </span>
      </div>
      <div className="inspector-semantic__row">
        <span className="inspector-semantic__label">Span</span>
        <span className="inspector-semantic__value">
          {placement.columnSpan} col x {placement.rowSpan} row
        </span>
      </div>
    </div>
  );
}

function SpanControls({
  candidates,
  onResizeSpan,
}: {
  readonly candidates: readonly GridSpanCandidate[];
  readonly onResizeSpan: (axis: "column" | "row", toSpan: number) => void;
}): ReactElement {
  if (candidates.length === 0) {
    return <p className="inspector-grid__empty">No span resize available.</p>;
  }
  return (
    <ul className="inspector-grid__span-list">
      {candidates.map((candidate) => {
        const direction = candidate.toSpan > candidate.fromSpan ? "grow" : "shrink";
        const label = `${direction} ${candidate.axis} span ${candidate.fromSpan} -> ${candidate.toSpan}`;
        return (
          <li key={`${candidate.axis}-${candidate.toSpan}`} className="inspector-grid__span-item">
            <button
              type="button"
              className="inspector-grid__span-button"
              onClick={() => onResizeSpan(candidate.axis, candidate.toSpan)}
            >
              {label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ReorderChoice({
  choice,
  onChoosePlacement,
}: {
  readonly choice: GridReorderCandidateSet;
  readonly onChoosePlacement: (choice: "dom-order" | "grid-area") => void;
}): ReactElement {
  const unsupported = choice.unsupported !== null ? choice.unsupported.message : null;
  return (
    <div className="inspector-grid__choice">
      <button
        type="button"
        className="inspector-grid__choice-button"
        onClick={() => onChoosePlacement("dom-order")}
        disabled={unsupported !== null}
      >
        DOM order ({choice.domOrder.fromIndex}
        {" -> "}
        {choice.domOrder.toIndex})
      </button>
      <button
        type="button"
        className="inspector-grid__choice-button"
        onClick={() => onChoosePlacement("grid-area")}
        disabled={unsupported !== null}
      >
        Grid area ({choice.gridArea.newGridArea})
      </button>
      {unsupported !== null && (
        <p className="inspector-grid__note" role="note">
          {unsupported}
        </p>
      )}
      {!choice.gridArea.a11ySafe && unsupported === null && (
        <p className="inspector-grid__note" role="note">
          Grid-area placement desyncs visual order from DOM reading order.
        </p>
      )}
    </div>
  );
}

export function GridPanel({
  placement,
  spanCandidates,
  reorderChoice,
  a11yWarning,
  onChoosePlacement,
  onResizeSpan,
}: GridPanelProps): ReactElement {
  if (placement === null) {
    return <p className="inspector-grid__empty">Selected element is not a grid item.</p>;
  }
  return (
    <div className="inspector-grid" data-vc-grid-panel>
      <PlacementRow placement={placement} />
      <div className="inspector-grid__section">
        <span className="inspector-semantic__label">Span</span>
        <SpanControls candidates={spanCandidates} onResizeSpan={onResizeSpan} />
      </div>
      {reorderChoice !== null && (
        <div className="inspector-grid__section">
          <span className="inspector-semantic__label">Reorder</span>
          <ReorderChoice choice={reorderChoice} onChoosePlacement={onChoosePlacement} />
        </div>
      )}
      {a11yWarning !== null && (
        <p className="inspector-grid__warning" role="alert">
          {a11yWarning}
        </p>
      )}
    </div>
  );
}
