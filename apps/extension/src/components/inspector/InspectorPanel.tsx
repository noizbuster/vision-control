import type { SelectionSummary } from "@vision-control/inspector-core";
import type { ReactElement } from "react";

import { Attributes } from "./Attributes.js";
import { BoxModel } from "./BoxModel.js";
import { Breadcrumb } from "./Breadcrumb.js";
import { ClassList } from "./ClassList.js";
import { ComputedStyle } from "./ComputedStyle.js";
import { SemanticSummary } from "./SemanticSummary.js";
import { SiblingSummary } from "./SiblingSummary.js";
import { SourceConfidence } from "./SourceConfidence.js";

interface InspectorPanelProps {
  readonly summary: SelectionSummary | null;
  readonly onSelectElement: (selector: string) => void;
}

interface SectionProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

function Section({ title, children }: SectionProps): ReactElement {
  return (
    <section className="inspector-section">
      <header className="inspector-section__header">{title}</header>
      <div className="inspector-section__body">{children}</div>
    </section>
  );
}

export function InspectorPanel({ summary, onSelectElement }: InspectorPanelProps): ReactElement {
  if (summary === null) {
    return (
      <div className="inspector-panel">
        <p className="inspector-panel__empty">Select an element to inspect.</p>
      </div>
    );
  }

  return (
    <div className="inspector-panel">
      <Section title="Identity">
        <div className="inspector-semantic">
          <div className="inspector-semantic__row">
            <span className="inspector-semantic__label">Selector</span>
            <span className="inspector-semantic__value">{summary.identity.selector ?? "none"}</span>
          </div>
          <div className="inspector-semantic__row">
            <span className="inspector-semantic__label">Confidence</span>
            <SourceConfidence confidence={summary.sourceConfidence} />
          </div>
        </div>
      </Section>

      <Section title="Breadcrumb">
        <Breadcrumb items={summary.breadcrumb} onSelect={onSelectElement} />
      </Section>

      <Section title="Semantic">
        <SemanticSummary semantic={summary.semantic} />
      </Section>

      <Section title="Box Model">
        <BoxModel boxModel={summary.boxModel} />
      </Section>

      <Section title="Computed Style">
        <ComputedStyle style={summary.computedStyle} />
      </Section>

      <Section title="Classes">
        <ClassList classes={summary.classList} />
      </Section>

      <Section title="Attributes">
        <Attributes attributes={summary.attributes} />
      </Section>

      <Section title="Siblings">
        <SiblingSummary summary={summary.siblingSummary} />
      </Section>
    </div>
  );
}
