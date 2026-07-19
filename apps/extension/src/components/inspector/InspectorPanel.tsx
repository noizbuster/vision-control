import type { Operation } from "@vision-control/change-ir";
import type { ConstraintViolation, MultiSelectGroup } from "@vision-control/editor-core";
import type { SelectionSummary } from "@vision-control/inspector-core";
import type {
  GridCellPlacement,
  GridReorderCandidateSet,
  GridSpanCandidate,
} from "@vision-control/layout-engine";
import type { ReactElement, ReactNode } from "react";
import type { EditorMode } from "../../hooks/useEditor.js";
import {
  ClassEditor,
  EditorToolbar,
  PseudoElementEditor,
  StyleEditor,
  TextEditor,
} from "../editors/index.js";
import type { EditableProp, PropEditCommand } from "../editors/PropsPanel.js";
import { PropsPanel } from "../editors/PropsPanel.js";
import { Attributes } from "./Attributes.js";
import { BoxModel } from "./BoxModel.js";
import { Breadcrumb } from "./Breadcrumb.js";
import { ClassList } from "./ClassList.js";
import { CollapsibleSection } from "./CollapsibleSection.js";
import { ComputedStyle } from "./ComputedStyle.js";
import { ElementActions } from "./ElementActions.js";
import { GridPanel } from "./GridPanel.js";
import { MultiSelectInspectorSection } from "./MultiSelectInspectorSection.js";
import { type SelectionCopyStatus, SelectionIdentitySection } from "./SelectionIdentitySection.js";
import { SemanticSummary } from "./SemanticSummary.js";
import { SiblingSummary } from "./SiblingSummary.js";

interface InspectorPanelProps {
  readonly summary: SelectionSummary | null;
  readonly onSelectElement: (selector: string) => void;
  readonly editorMode: EditorMode;
  readonly onChangeEditorMode: (mode: EditorMode) => void;
  readonly onEditorCommand: (command: Operation) => void;
  readonly onValidationError: (error: string | null) => void;
  readonly multiSelectGroup?: MultiSelectGroup | null;
  readonly multiSelectViolations?: readonly ConstraintViolation[];
  /**
   * Optional alignment/distribution panel slot (VC-V1V2-07). Additive: when
   * absent, the inspector renders exactly as before. The caller passes a
   * rendered {@link AlignmentPanel} (or any node) to surface alignment
   * commands under the multi-select section.
   */
  readonly alignmentPanel?: ReactNode;
  /**
   * Optional CSS Grid editing slot (VC-V1V2-09). Additive: when
   * `gridPlacement` is null/absent the inspector renders exactly as before.
   */
  readonly gridPlacement?: GridCellPlacement | null;
  readonly gridSpanCandidates?: readonly GridSpanCandidate[];
  readonly gridReorderChoice?: GridReorderCandidateSet | null;
  readonly gridA11yWarning?: string | null;
  readonly onChooseGridPlacement?: (choice: "dom-order" | "grid-area") => void;
  readonly onResizeGridSpan?: (axis: "column" | "row", toSpan: number) => void;
  readonly autoLayoutPanel?: ReactNode;
  readonly flexResizeStatusPanel?: ReactNode;
  readonly moveRejectionPanel?: ReactNode;
  readonly canCopySelectionContext?: boolean;
  readonly onCopySelectionContext?: () => void;
  readonly selectionCopyStatus?: SelectionCopyStatus;
  /** Additive: render only when non-empty. */
  readonly componentProps?: readonly EditableProp[];
  readonly onPropCommand?: (command: PropEditCommand) => void;
}

const EMPTY_COPY = "Select an element on the page to inspect. Editing works offline.";

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
  flexResizeStatusPanel,
  moveRejectionPanel,
  canCopySelectionContext = false,
  onCopySelectionContext,
  selectionCopyStatus = "idle",
  componentProps = [],
  onPropCommand,
}: InspectorPanelProps): ReactElement {
  if (summary === null && multiSelectGroup === null) {
    return (
      <div className="inspector-panel">
        <CollapsibleSection title="Mode" defaultOpen>
          <EditorToolbar activeMode={editorMode} onChangeMode={onChangeEditorMode} />
        </CollapsibleSection>
        <p className="inspector-panel__empty">{EMPTY_COPY}</p>
      </div>
    );
  }

  const showProps = summary !== null && componentProps.length > 0 && onPropCommand !== undefined;

  return (
    <div className="inspector-panel">
      {multiSelectGroup !== null && (
        <CollapsibleSection title="Multi-Select Group" defaultOpen>
          <MultiSelectInspectorSection
            group={multiSelectGroup}
            violations={multiSelectViolations}
          />
        </CollapsibleSection>
      )}
      {alignmentPanel !== undefined && (
        <CollapsibleSection title="Alignment" defaultOpen>
          {alignmentPanel}
        </CollapsibleSection>
      )}
      {summary !== null && (
        <>
          <CollapsibleSection title="Identity" defaultOpen>
            <SelectionIdentitySection
              summary={summary}
              canCopySelectionContext={canCopySelectionContext}
              onCopySelectionContext={onCopySelectionContext}
              selectionCopyStatus={selectionCopyStatus}
            />
          </CollapsibleSection>

          <CollapsibleSection title="Editors" defaultOpen>
            <EditorToolbar activeMode={editorMode} onChangeMode={onChangeEditorMode} />
            {editorMode === "style" && (
              <>
                <StyleEditor
                  summary={summary}
                  onCommand={onEditorCommand}
                  onValidationError={onValidationError}
                />
                <p className="inspector-panel__hint">
                  Computed values are also listed below (collapsed by default).
                </p>
              </>
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
            <ElementActions summary={summary} onCommand={onEditorCommand} />
          </CollapsibleSection>

          {flexResizeStatusPanel !== undefined && (
            <CollapsibleSection title="Resize" defaultOpen>
              {flexResizeStatusPanel}
            </CollapsibleSection>
          )}

          {moveRejectionPanel !== undefined && (
            <CollapsibleSection title="Move" defaultOpen>
              {moveRejectionPanel}
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Pseudo" defaultOpen>
            <PseudoElementEditor
              summary={summary}
              onCommand={onEditorCommand}
              onValidationError={onValidationError}
            />
          </CollapsibleSection>

          {showProps && (
            <CollapsibleSection title="Component Props" defaultOpen>
              <PropsPanel summary={summary} props={componentProps} onCommand={onPropCommand} />
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Breadcrumb" defaultOpen>
            <Breadcrumb items={summary.breadcrumb} onSelect={onSelectElement} />
          </CollapsibleSection>

          <CollapsibleSection title="Semantic" defaultOpen={false}>
            <SemanticSummary semantic={summary.semantic} />
          </CollapsibleSection>

          <CollapsibleSection title="Box Model" defaultOpen={false}>
            <BoxModel boxModel={summary.boxModel} />
          </CollapsibleSection>

          <CollapsibleSection title="Computed Style" defaultOpen={false}>
            <ComputedStyle style={summary.computedStyle} />
          </CollapsibleSection>

          <CollapsibleSection title="Classes" defaultOpen={false}>
            <ClassList classes={summary.classList} />
          </CollapsibleSection>

          <CollapsibleSection title="Attributes" defaultOpen={false}>
            <Attributes attributes={summary.attributes} />
          </CollapsibleSection>

          <CollapsibleSection title="Siblings" defaultOpen={false}>
            <SiblingSummary summary={summary.siblingSummary} />
          </CollapsibleSection>

          {autoLayoutPanel !== undefined && (
            <CollapsibleSection title="Auto Layout" defaultOpen>
              {autoLayoutPanel}
            </CollapsibleSection>
          )}

          {gridPlacement !== null && (
            <CollapsibleSection title="Grid" defaultOpen>
              <GridPanel
                placement={gridPlacement}
                spanCandidates={gridSpanCandidates}
                reorderChoice={gridReorderChoice}
                a11yWarning={gridA11yWarning}
                onChoosePlacement={(choice) => onChooseGridPlacement?.(choice)}
                onResizeSpan={(axis, toSpan) => onResizeGridSpan?.(axis, toSpan)}
              />
            </CollapsibleSection>
          )}
        </>
      )}
    </div>
  );
}
