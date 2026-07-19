import type { Operation } from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import type { SelectionSummary } from "@vision-control/inspector-core";
import { useLayoutEffect, useRef } from "react";
import type { EditorMode } from "../../hooks/useEditor.js";
import {
  buildAlignmentOperation,
  buildGridReorderOperation,
  buildGridSpanOperation,
} from "../../inspector-slot-commands.js";
import type { GridPlacementMessage } from "../../messaging/index.js";
import type { FlexResizeStatus as FlexResizeStatusState } from "../../messaging/resize-messages.js";
import type { EditableProp } from "../editors/PropsPanel.js";
import { AlignmentPanel } from "./AlignmentPanel.js";
import { AutoLayoutPanel } from "./AutoLayoutPanel.js";
import { FlexResizeStatus } from "./FlexResizeStatus.js";
import { InspectorPanel } from "./InspectorPanel.js";

interface InspectorEditorSlotsProps {
  readonly summary: SelectionSummary | null;
  readonly onSelectElement: (selector: string) => void;
  readonly editorMode: EditorMode;
  readonly onChangeEditorMode: (mode: EditorMode) => void;
  readonly onEditorCommand: (command: Operation) => void;
  readonly onValidationError: (error: string | null) => void;
  readonly multiSelectGroup: MultiSelectGroup | null;
  readonly gridPlacementState: GridPlacementMessage | null;
  readonly canCopySelectionContext: boolean;
  readonly onCopySelectionContext: () => void;
  readonly selectionCopyStatus: "idle" | "resolving" | "copied" | "error";
  readonly componentProps: readonly EditableProp[];
  readonly flexResizeStatus: FlexResizeStatusState | null;
  readonly moveRejection: string | null;
}

export function InspectorEditorSlots({
  summary,
  onSelectElement,
  editorMode,
  onChangeEditorMode,
  onEditorCommand,
  onValidationError,
  multiSelectGroup,
  gridPlacementState,
  canCopySelectionContext,
  onCopySelectionContext,
  selectionCopyStatus,
  componentProps,
  flexResizeStatus,
  moveRejection,
}: InspectorEditorSlotsProps): React.ReactElement {
  const moveRejectionStatusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    moveRejectionStatusRef.current?.scrollIntoView({ block: "nearest" });
  }, [moveRejection]);

  const isLayoutContainer =
    summary !== null &&
    (summary.computedStyle.display === "flex" || summary.computedStyle.display === "grid");
  const alignmentPanel =
    multiSelectGroup !== null && multiSelectGroup.members.length >= 2 ? (
      <AlignmentPanel
        memberCount={multiSelectGroup.members.length}
        onCommand={(kind) => {
          const operation = buildAlignmentOperation(multiSelectGroup, kind);
          if (operation !== null) onEditorCommand(operation);
        }}
      />
    ) : undefined;
  const autoLayoutPanel =
    isLayoutContainer && summary !== null ? (
      <AutoLayoutPanel summary={summary} onCommand={onEditorCommand} />
    ) : undefined;
  const flexResizeStatusPanel =
    flexResizeStatus === null ? undefined : <FlexResizeStatus status={flexResizeStatus} />;
  const moveRejectionPanel =
    moveRejection === null ? undefined : (
      <section
        ref={moveRejectionStatusRef}
        className="move-rejection-status"
        data-testid="move-rejection-status"
        role="alert"
      >
        <h3 className="move-rejection-status__heading">Move rejected</h3>
        <p className="move-rejection-status__message">{moveRejection}</p>
      </section>
    );

  return (
    <InspectorPanel
      summary={summary}
      onSelectElement={onSelectElement}
      editorMode={editorMode}
      onChangeEditorMode={onChangeEditorMode}
      onEditorCommand={onEditorCommand}
      onValidationError={onValidationError}
      multiSelectGroup={multiSelectGroup}
      gridPlacement={gridPlacementState?.placement ?? null}
      gridSpanCandidates={gridPlacementState?.spanCandidates ?? []}
      gridReorderChoice={gridPlacementState?.reorderChoice ?? null}
      gridA11yWarning={gridPlacementState?.a11yWarning ?? null}
      onChooseGridPlacement={(choice) => {
        if (gridPlacementState !== null) {
          onEditorCommand(buildGridReorderOperation(gridPlacementState, choice));
        }
      }}
      onResizeGridSpan={(axis, toSpan) => {
        if (gridPlacementState !== null) {
          onEditorCommand(buildGridSpanOperation(gridPlacementState, axis, toSpan));
        }
      }}
      canCopySelectionContext={canCopySelectionContext}
      onCopySelectionContext={onCopySelectionContext}
      selectionCopyStatus={selectionCopyStatus}
      componentProps={componentProps}
      onPropCommand={onEditorCommand}
      {...(alignmentPanel !== undefined ? { alignmentPanel } : {})}
      {...(autoLayoutPanel !== undefined ? { autoLayoutPanel } : {})}
      {...(flexResizeStatusPanel !== undefined ? { flexResizeStatusPanel } : {})}
      {...(moveRejectionPanel !== undefined ? { moveRejectionPanel } : {})}
    />
  );
}
