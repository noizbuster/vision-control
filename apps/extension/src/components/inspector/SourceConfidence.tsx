import type { SourceConfidence as SourceConfidenceType } from "@vision-control/inspector-core";
import type { ReactElement, ReactNode } from "react";

/** Local confidence UI candidate view (map-origins / panel export path). */
export interface ConfidenceCandidateView {
  readonly sourceId?: string;
  readonly workspaceRelativePath?: string;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly componentName?: string;
  readonly staticClassName?: string;
  readonly cssFilePath?: string;
  readonly snippet?: string;
  readonly confidence: "high" | "medium" | "low";
  readonly methodBadge: readonly string[];
  readonly reasonBadges: readonly string[];
  readonly ownershipRisk?: "none" | "low" | "medium" | "high";
}

/** Local confidence UI data shape for the inspector panel. */
export interface ConfidenceUiData {
  readonly selected?: ConfidenceCandidateView;
  readonly alternatives: readonly ConfidenceCandidateView[];
  readonly ambiguous: boolean;
  readonly repeatedInstance: boolean;
  readonly staleFingerprint: boolean;
}

interface SourceConfidenceProps {
  readonly confidence: SourceConfidenceType;
  readonly detail?: ConfidenceUiData;
}

export function SourceConfidence({ confidence, detail }: SourceConfidenceProps): ReactElement {
  return (
    <span
      className={`inspector-confidence inspector-confidence--${confidence}`}
      data-testid="source-confidence"
    >
      <span className="inspector-confidence__level">{confidence}</span>
      {detail !== undefined ? <ConfidenceDetail detail={detail} /> : null}
    </span>
  );
}

function ConfidenceDetail({ detail }: { readonly detail: ConfidenceUiData }): ReactElement {
  return (
    <span className="inspector-confidence__detail">
      {detail.repeatedInstance ? <Badge tone="warning">repeated instance</Badge> : null}
      {detail.staleFingerprint ? <Badge tone="warning">stale fingerprint</Badge> : null}
      {detail.ambiguous ? <Badge tone="info">ambiguous</Badge> : null}
      {detail.selected ? <SelectedCandidate view={detail.selected} /> : null}
      {detail.alternatives.length > 0 ? (
        <span className="inspector-confidence__alternatives">
          <span className="inspector-confidence__label">Alternatives</span>
          {detail.alternatives.map((alt, index) => (
            <AlternativeCandidate key={alt.sourceId ?? `alt-${index}`} view={alt} />
          ))}
        </span>
      ) : null}
    </span>
  );
}

function SelectedCandidate({ view }: { readonly view: ConfidenceCandidateView }): ReactElement {
  return (
    <span className="inspector-confidence__selected">
      <span className="inspector-confidence__label">Selected candidate</span>
      <CandidateBody view={view} />
    </span>
  );
}

function AlternativeCandidate({ view }: { readonly view: ConfidenceCandidateView }): ReactElement {
  return (
    <span className="inspector-confidence__alternative">
      <CandidateBody view={view} />
    </span>
  );
}

function CandidateBody({ view }: { readonly view: ConfidenceCandidateView }): ReactElement {
  return (
    <span className="inspector-confidence__candidate">
      <span
        className={`inspector-confidence__candidate-level inspector-confidence--${view.confidence}`}
      >
        {view.confidence}
      </span>
      {view.workspaceRelativePath ? (
        <span className="inspector-confidence__candidate-path">{view.workspaceRelativePath}</span>
      ) : null}
      {view.componentName ? (
        <span className="inspector-confidence__candidate-component">{view.componentName}</span>
      ) : null}
      {view.methodBadge.map((method) => (
        <Badge key={method} tone="method">
          {method}
        </Badge>
      ))}
      {view.reasonBadges.map((reason) => (
        <Badge key={reason} tone="warning">
          {reason}
        </Badge>
      ))}
    </span>
  );
}

function Badge({
  tone,
  children,
}: {
  readonly tone: "method" | "warning" | "info";
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className={`inspector-confidence__badge inspector-confidence__badge--${tone}`}>
      {children}
    </span>
  );
}
