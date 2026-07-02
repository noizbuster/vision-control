import type { BoxModelSummary } from "@vision-control/inspector-core";
import type { ReactElement } from "react";

interface BoxModelProps {
  readonly boxModel: BoxModelSummary;
}

function edgeLabel(
  label: string,
  edges: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  },
): string {
  return `${label}: ${edges.top} / ${edges.right} / ${edges.bottom} / ${edges.left}`;
}

export function BoxModel({ boxModel }: BoxModelProps): ReactElement {
  return (
    <div className="inspector-box-model">
      <div className="inspector-box-model__layer inspector-box-model__layer--margin">
        <strong>margin</strong>
        <span>{edgeLabel("t/r/b/l", boxModel.margin)}</span>
      </div>
      <div className="inspector-box-model__layer inspector-box-model__layer--border">
        <strong>border</strong>
        <span>{edgeLabel("t/r/b/l", boxModel.border)}</span>
      </div>
      <div className="inspector-box-model__layer inspector-box-model__layer--padding">
        <strong>padding</strong>
        <span>{edgeLabel("t/r/b/l", boxModel.padding)}</span>
      </div>
      <div className="inspector-box-model__layer inspector-box-model__layer--content">
        <strong>content</strong>
        <span>
          {boxModel.content.width} × {boxModel.content.height}
        </span>
      </div>
      <div className="inspector-box-model__position">
        position: {boxModel.position.x}, {boxModel.position.y}
      </div>
    </div>
  );
}
