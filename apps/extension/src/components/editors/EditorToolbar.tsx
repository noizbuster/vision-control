import type { ReactElement } from "react";

import type { EditorMode } from "../../hooks/useEditor.js";

interface EditorToolbarProps {
  readonly activeMode: EditorMode;
  readonly onChangeMode: (mode: EditorMode) => void;
}

interface ToolbarButtonProps {
  readonly mode: EditorMode;
  readonly label: string;
  readonly activeMode: EditorMode;
  readonly onClick: () => void;
}

function ToolbarButton({ mode, label, activeMode, onClick }: ToolbarButtonProps): ReactElement {
  const isActive = activeMode === mode;
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
    <fieldset className="editor-toolbar" aria-label="Element editors">
      <ToolbarButton
        mode="style"
        label="Edit Style"
        activeMode={activeMode}
        onClick={() => onChangeMode(activeMode === "style" ? null : "style")}
      />
      <ToolbarButton
        mode="class"
        label="Edit Classes"
        activeMode={activeMode}
        onClick={() => onChangeMode(activeMode === "class" ? null : "class")}
      />
      <ToolbarButton
        mode="text"
        label="Edit Text"
        activeMode={activeMode}
        onClick={() => onChangeMode(activeMode === "text" ? null : "text")}
      />
    </fieldset>
  );
}
