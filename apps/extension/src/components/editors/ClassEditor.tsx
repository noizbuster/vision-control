import type { ClassEntry, SelectionSummary } from "@vision-control/inspector-core";
import {
  createClassAddCommand,
  createClassRemoveCommand,
  createClassReplaceCommand,
} from "@vision-control/inspector-core";
import type { ReactElement } from "react";
import { useCallback, useState } from "react";

interface ClassEditorProps {
  readonly summary: SelectionSummary;
  readonly onCommand: (
    command:
      | ReturnType<typeof createClassAddCommand>
      | ReturnType<typeof createClassRemoveCommand>
      | ReturnType<typeof createClassReplaceCommand>,
  ) => void;
}

interface ClassChipProps {
  readonly entry: ClassEntry;
  readonly target: SelectionSummary["identity"];
  readonly onCommand: ClassEditorProps["onCommand"];
}

function ClassChip({ entry, target, onCommand }: ClassChipProps): ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(entry.name);

  const remove = useCallback((): void => {
    onCommand(
      createClassRemoveCommand(
        { runtimeId: target.runtimeId, selector: target.selector ?? undefined },
        entry.name,
      ),
    );
  }, [entry.name, target, onCommand]);

  const commitReplace = useCallback((): void => {
    const trimmed = draft.trim();
    if (trimmed === entry.name || trimmed.length === 0) {
      setIsEditing(false);
      setDraft(entry.name);
      return;
    }
    onCommand(
      createClassReplaceCommand(
        { runtimeId: target.runtimeId, selector: target.selector ?? undefined },
        entry.name,
        trimmed,
      ),
    );
    setIsEditing(false);
  }, [draft, entry.name, target, onCommand]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitReplace();
      } else if (event.key === "Escape") {
        setIsEditing(false);
        setDraft(entry.name);
      }
    },
    [commitReplace, entry.name],
  );

  if (isEditing) {
    return (
      <input
        type="text"
        className="class-editor__chip-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitReplace}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <li className="class-editor__chip">
      <button
        type="button"
        className="class-editor__chip-name"
        onClick={() => setIsEditing(true)}
        title="Click to edit"
      >
        {entry.name}
      </button>
      <button
        type="button"
        className="class-editor__chip-remove"
        onClick={remove}
        aria-label={`Remove class ${entry.name}`}
        title="Remove"
      >
        ×
      </button>
    </li>
  );
}

export function ClassEditor({ summary, onCommand }: ClassEditorProps): ReactElement {
  const [newClass, setNewClass] = useState("");
  const target = summary.identity;

  const add = useCallback((): void => {
    const trimmed = newClass.trim();
    if (trimmed.length === 0) {
      return;
    }
    onCommand(
      createClassAddCommand(
        { runtimeId: target.runtimeId, selector: target.selector ?? undefined },
        trimmed,
      ),
    );
    setNewClass("");
  }, [newClass, target, onCommand]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === "Enter") {
        event.preventDefault();
        add();
      }
    },
    [add],
  );

  return (
    <div className="class-editor">
      <div className="class-editor__add-row">
        <input
          type="text"
          className="class-editor__input"
          placeholder="Add a class…"
          value={newClass}
          onChange={(event) => setNewClass(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="button" className="class-editor__add-button" onClick={add}>
          Add
        </button>
      </div>

      {summary.classList.length === 0 ? (
        <p className="class-editor__empty">No classes to edit.</p>
      ) : (
        <ul className="class-editor__list">
          {summary.classList.map((entry) => (
            <ClassChip key={entry.name} entry={entry} target={target} onCommand={onCommand} />
          ))}
        </ul>
      )}
    </div>
  );
}
