import type { SourceConfidence as SourceConfidenceType } from "@vision-control/inspector-core";
import type { ReactElement } from "react";

interface SourceConfidenceProps {
  readonly confidence: SourceConfidenceType;
}

export function SourceConfidence({ confidence }: SourceConfidenceProps): ReactElement {
  return (
    <span className={`inspector-confidence inspector-confidence--${confidence}`}>{confidence}</span>
  );
}
