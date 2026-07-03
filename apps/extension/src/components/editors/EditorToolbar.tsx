import type { InteractionMode } from "@vision-control/overlay-ui";
import type { ReactElement } from "react";

import type { EditorMode, PropertyEditorKind } from "../../hooks/useEditor.js";

const INTERACTION_MODES: ReadonlyArray<{
  readonly mode: InteractionMode;
  readonly label: string;
}> = [
  { mode: "Inspect", label: "Inspect" },
  { mode: "Move", label: "Move" },
  { mode: "Resize", label: "Resize" },
  { mode: "Text", label: "Text" },
  { mode: "Layout", label: "Layout" },
];

const PROPERTY_EDITORS: ReadonlyArray<{
  readonly mode: PropertyEditorKind;
  readonly label: string;
}> = [
  { mode: "style", label: "Edit Style" },
  { mode: "class", label: "Edit Classes" },
  { mode: "text", label: "Edit Text" },
];

interface EditorToolbarProps {
  readonly activeMode: EditorMode;
  readonly onChangeMode: (mode: EditorMode) => void;
}

interface ToolbarButtonProps {
  readonly label: string;
  readonly isActive: boolean;
  readonly onClick: () => void;
}

function ToolbarButton({ label, isActive, onClick }: ToolbarButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={`editor-toolbar__button ${isActive ? "editor-toolbar__button--active" : ""}`}
      aria-pressed={isActive}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function EditorToolbar({ activeMode, onChangeMode }: EditorToolbarProps): ReactElement {
  return (
    <fieldset className="editor-toolbar" aria-label="Interaction modes and element editors">
      <div className="editor-toolbar__group">
        {INTERACTION_MODES.map(({ mode, label }) => (
          <ToolbarButton
            key={mode}
            label={label}
            isActive={activeMode === mode}
            onClick={() => onChangeMode(activeMode === mode ? null : mode)}
          />
        ))}
      </div>
      <div className="editor-toolbar__group">
        {PROPERTY_EDITORS.map(({ mode, label }) => (
          <ToolbarButton
            key={mode}
            label={label}
            isActive={activeMode === mode}
            onClick={() => onChangeMode(activeMode === mode ? null : mode)}
          />
        ))}
      </div>
    </fieldset>
  );
}
