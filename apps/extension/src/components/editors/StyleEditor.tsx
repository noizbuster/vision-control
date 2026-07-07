import type { ComputedStyleSummary, SelectionSummary } from "@vision-control/inspector-core";
import {
  createStyleEditCommand,
  validateCssProperty,
  validateCssValue,
} from "@vision-control/inspector-core";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface StyleEditorProps {
  readonly summary: SelectionSummary;
  readonly onCommand: (command: ReturnType<typeof createStyleEditCommand>) => void;
  readonly onValidationError: (error: string | null) => void;
}

type StyleEntry = { readonly key: string; readonly value: string };

function computedStyleEntries(style: ComputedStyleSummary): readonly StyleEntry[] {
  return [
    { key: "display", value: style.display },
    { key: "position", value: style.position },
    { key: "width", value: style.width },
    { key: "height", value: style.height },
    { key: "flexDirection", value: style.flexDirection },
    { key: "alignItems", value: style.alignItems },
    { key: "justifyContent", value: style.justifyContent },
    { key: "flexBasis", value: style.flexBasis },
    { key: "flexGrow", value: style.flexGrow },
    { key: "padding", value: style.padding },
    { key: "margin", value: style.margin },
    { key: "border", value: style.border },
    { key: "color", value: style.color },
    { key: "backgroundColor", value: style.backgroundColor },
    { key: "fontSize", value: style.fontSize },
    { key: "fontWeight", value: style.fontWeight },
    { key: "lineHeight", value: style.lineHeight },
  ];
}

function kebabCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

interface EditableRowProps {
  readonly entry: StyleEntry;
  readonly target: SelectionSummary["identity"];
  readonly onCommand: (command: ReturnType<typeof createStyleEditCommand>) => void;
  readonly onValidationError: (error: string | null) => void;
}

function EditableRow({
  entry,
  target,
  onCommand,
  onValidationError,
}: EditableRowProps): ReactElement {
  const [draft, setDraft] = useState(entry.value);
  const [committedValue, setCommittedValue] = useState(entry.value);
  const [error, setError] = useState<string | null>(null);

  const property = useMemo(() => kebabCase(entry.key), [entry.key]);

  useEffect(() => {
    setDraft(entry.value);
    setCommittedValue(entry.value);
    setError(null);
  }, [entry.value]);

  const commit = useCallback((): void => {
    const trimmed = draft.trim();
    if (trimmed === committedValue) {
      setError(null);
      onValidationError(null);
      return;
    }

    if (!validateCssProperty(property)) {
      const message = `Unknown property "${property}"`;
      setError(message);
      onValidationError(message);
      return;
    }

    const result = validateCssValue(property, trimmed);
    if (!result.valid) {
      const message = result.error ?? `Invalid value for ${property}`;
      setError(message);
      onValidationError(message);
      return;
    }

    setError(null);
    onValidationError(null);
    setDraft(trimmed);
    setCommittedValue(trimmed);
    const commandTarget = {
      runtimeId: target.runtimeId,
      ...(target.sourceId !== undefined ? { sourceId: target.sourceId } : {}),
      ...(target.selector !== undefined ? { selector: target.selector } : {}),
    };
    onCommand(createStyleEditCommand(commandTarget, property, trimmed, committedValue));
  }, [committedValue, draft, property, target, onCommand, onValidationError]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    },
    [commit],
  );

  return (
    <div className="style-editor__row">
      <span className="style-editor__property">{property}</span>
      <input
        type="text"
        className={`style-editor__input ${error ? "style-editor__input--error" : ""}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        aria-invalid={error !== null}
        aria-errormessage={error ?? undefined}
      />
      {error !== null && <span className="style-editor__error">{error}</span>}
    </div>
  );
}

export function StyleEditor({
  summary,
  onCommand,
  onValidationError,
}: StyleEditorProps): ReactElement {
  const entries = useMemo(
    () => computedStyleEntries(summary.computedStyle),
    [summary.computedStyle],
  );

  return (
    <div className="style-editor">
      <p className="style-editor__hint">
        Edit a value and press Enter or blur to create a command.
      </p>
      <ul className="style-editor__list">
        {entries.map((entry) => (
          <EditableRow
            key={entry.key}
            entry={entry}
            target={summary.identity}
            onCommand={onCommand}
            onValidationError={onValidationError}
          />
        ))}
      </ul>
    </div>
  );
}
