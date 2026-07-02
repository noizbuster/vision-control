import type { SemanticSummary as SemanticSummaryType } from "@vision-control/inspector-core";
import type { ReactElement } from "react";

interface SemanticSummaryProps {
  readonly semantic: SemanticSummaryType;
}

export function SemanticSummary({ semantic }: SemanticSummaryProps): ReactElement {
  return (
    <div className="inspector-semantic">
      <div className="inspector-semantic__row">
        <span className="inspector-semantic__label">Tag</span>
        <span className="inspector-semantic__value">
          <span className="inspector-tag">{semantic.tagName}</span>
        </span>
      </div>
      {semantic.role !== undefined && semantic.role.length > 0 && (
        <div className="inspector-semantic__row">
          <span className="inspector-semantic__label">Role</span>
          <span className="inspector-semantic__value">{semantic.role}</span>
        </div>
      )}
      {semantic.name !== undefined && semantic.name.length > 0 && (
        <div className="inspector-semantic__row">
          <span className="inspector-semantic__label">Name</span>
          <span className="inspector-semantic__value">{semantic.name}</span>
        </div>
      )}
      {semantic.description !== undefined && semantic.description.length > 0 && (
        <div className="inspector-semantic__row">
          <span className="inspector-semantic__label">Desc</span>
          <span className="inspector-semantic__value">{semantic.description}</span>
        </div>
      )}
      {semantic.textContentPreview.length > 0 && (
        <div className="inspector-text-preview" role="note" aria-label="Text content preview">
          {semantic.textContentPreview}
        </div>
      )}
    </div>
  );
}
