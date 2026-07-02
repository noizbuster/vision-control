import type { SiblingSummary as SiblingSummaryType } from "@vision-control/inspector-core";
import type { ReactElement } from "react";

interface SiblingSummaryProps {
  readonly summary: SiblingSummaryType;
}

export function SiblingSummary({ summary }: SiblingSummaryProps): ReactElement {
  return (
    <div className="inspector-sibling">
      <div className="inspector-sibling__metric">
        <span className="inspector-sibling__label">Siblings</span>
        <span className="inspector-sibling__value">{summary.count}</span>
      </div>
      <div className="inspector-sibling__metric">
        <span className="inspector-sibling__label">Index</span>
        <span className="inspector-sibling__value">{summary.index}</span>
      </div>
      <div className="inspector-sibling__metric">
        <span className="inspector-sibling__label">Parent</span>
        <span className="inspector-sibling__value">
          <span className="inspector-tag">{summary.parentTagName}</span>
          {summary.parentLayoutRole !== undefined && summary.parentLayoutRole.length > 0 && (
            <span className="inspector-role">[{summary.parentLayoutRole}]</span>
          )}
        </span>
      </div>
    </div>
  );
}
