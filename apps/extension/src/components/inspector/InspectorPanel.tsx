import type {
  ClassAddOperation,
  ClassRemoveOperation,
  ClassReplaceOperation,
  StyleEditOperation,
  TextEditOperation,
} from "@vision-control/change-ir";
import type { ConstraintViolation, MultiSelectGroup } from "@vision-control/editor-core";
import type { SelectionSummary } from "@vision-control/inspector-core";
import type {
  GridCellPlacement,
  GridReorderCandidateSet,
  GridSpanCandidate,
} from "@vision-control/layout-engine";
import type { ReactElement } from "react";
import type { EditorMode } from "../../hooks/useEditor.js";
import { ClassEditor, EditorToolbar, StyleEditor, TextEditor } from "../editors/index.js";
import { Attributes } from "./Attributes.js";
import { BoxModel } from "./BoxModel.js";
import { Breadcrumb } from "./Breadcrumb.js";
import { ClassList } from "./ClassList.js";
import { ComputedStyle } from "./ComputedStyle.js";
import { GridPanel } from "./GridPanel.js";
import { MultiSelectInspectorSection } from "./MultiSelectInspectorSection.js";
import { SemanticSummary } from "./SemanticSummary.js";
import { SiblingSummary } from "./SiblingSummary.js";
import { SourceConfidence } from "./SourceConfidence.js";

interface InspectorPanelProps {
  readonly summary: SelectionSummary | null;
  readonly onSelectElement: (selector: string) => void;
  readonly editorMode: EditorMode;
  readonly onChangeEditorMode: (mode: EditorMode) => void;
  readonly onEditorCommand: (
    command:
      | StyleEditOperation
      | ClassAddOperation
      | ClassRemoveOperation
      | ClassReplaceOperation
      | TextEditOperation,
  ) => void;
  readonly onValidationError: (error: string | null) => void;
  readonly multiSelectGroup?: MultiSelectGroup | null;
  readonly multiSelectViolations?: readonly ConstraintViolation[];
  /**
   * Optional alignment/distribution panel slot (VC-V1V2-07). Additive: when
   * absent, the inspector renders exactly as before. The caller passes a
   * rendered {@link AlignmentPanel} (or any node) to surface alignment
   * commands under the multi-select section.
   */
  readonly alignmentPanel?: React.ReactNode;
  /**
   * Optional CSS Grid editing slot (VC-V1V2-09). Additive: when
   * `gridPlacement` is null/absent the inspector renders exactly as before.
   * The caller supplies the inferred placement, span candidates, the
   * DOM-order-vs-grid-area reorder choice, and the accessibility warning from
   * the layout-engine grid module.
   */
  readonly gridPlacement?: GridCellPlacement | null;
  readonly gridSpanCandidates?: readonly GridSpanCandidate[];
  readonly gridReorderChoice?: GridReorderCandidateSet | null;
  readonly gridA11yWarning?: string | null;
  readonly onChooseGridPlacement?: (choice: "dom-order" | "grid-area") => void;
  readonly onResizeGridSpan?: (axis: "column" | "row", toSpan: number) => void;
  readonly autoLayoutPanel?: React.ReactNode;
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

export function InspectorPanel({
  summary,
  onSelectElement,
  editorMode,
  onChangeEditorMode,
  onEditorCommand,
  onValidationError,
  multiSelectGroup = null,
  multiSelectViolations = [],
  alignmentPanel,
  gridPlacement = null,
  gridSpanCandidates = [],
  gridReorderChoice = null,
  gridA11yWarning = null,
  onChooseGridPlacement,
  onResizeGridSpan,
  autoLayoutPanel,
}: InspectorPanelProps): ReactElement {
  if (summary === null && multiSelectGroup === null) {
    return (
      <div className="inspector-panel">
        <p className="inspector-panel__empty">Select an element to inspect.</p>
      </div>
    );
  }

  return (
    <div className="inspector-panel">
      {multiSelectGroup !== null && (
        <Section title="Multi-Select Group">
          <MultiSelectInspectorSection
            group={multiSelectGroup}
            violations={multiSelectViolations}
          />
        </Section>
      )}
      {alignmentPanel !== undefined && <Section title="Alignment">{alignmentPanel}</Section>}
      {summary !== null && (
        <>
          <Section title="Identity">
            <div className="inspector-semantic">
              <div className="inspector-semantic__row">
                <span className="inspector-semantic__label">Selector</span>
                <span className="inspector-semantic__value">
                  {summary.identity.selector ?? "none"}
                </span>
              </div>
              <div className="inspector-semantic__row">
                <span className="inspector-semantic__label">Confidence</span>
                <SourceConfidence confidence={summary.sourceConfidence} />
              </div>
            </div>
          </Section>

          <Section title="Editors">
            <EditorToolbar activeMode={editorMode} onChangeMode={onChangeEditorMode} />
            {editorMode === "style" && (
              <StyleEditor
                summary={summary}
                onCommand={onEditorCommand}
                onValidationError={onValidationError}
              />
            )}
            {editorMode === "class" && (
              <ClassEditor summary={summary} onCommand={onEditorCommand} />
            )}
            {editorMode === "text" && (
              <TextEditor
                summary={summary}
                onCommand={onEditorCommand}
                onClose={() => onChangeEditorMode(null)}
              />
            )}
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

          {autoLayoutPanel !== undefined && (
            <Section title="Auto Layout">{autoLayoutPanel}</Section>
          )}

          {gridPlacement !== null && (
            <Section title="Grid">
              <GridPanel
                placement={gridPlacement}
                spanCandidates={gridSpanCandidates}
                reorderChoice={gridReorderChoice}
                a11yWarning={gridA11yWarning}
                onChoosePlacement={(choice) => onChooseGridPlacement?.(choice)}
                onResizeSpan={(axis, toSpan) => onResizeGridSpan?.(axis, toSpan)}
              />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
