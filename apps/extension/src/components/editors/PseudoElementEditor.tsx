import type {
  ElementRef,
  PseudoStyleEditOperation,
  PseudoStyleTarget,
} from "@vision-control/change-ir";
import { PseudoStyleTargetSchema } from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";
import type { ReactElement } from "react";
import { useCallback, useState } from "react";

/**
 * Closed pseudo-target whitelist ( `::before` / `::after` + the four states ).
 * Sourced from the change-ir schema so the editor can never offer a target the
 * op schema would reject at the boundary.
 */
const PSEUDO_TARGETS: readonly PseudoStyleTarget[] = [...PseudoStyleTargetSchema.options];

export interface PseudoStyleEditCommandOptions {
  readonly timestamp?: number;
  readonly id?: string;
  readonly origin?: PseudoStyleEditOperation["origin"];
}

/**
 * Build a {@link PseudoStyleEditOperation} from an inspector commit. Mirrors
 * the {@link createStyleEditCommand} shape but carries `pseudoTarget` and routes
 * through the preview-engine `applyPseudoPreview` stylesheet path ( never the
 * inline style ), keeping `style-edit` pure.
 */
export function createPseudoStyleEditCommand(
  target: ElementRef | { readonly runtimeId: string },
  pseudoTarget: PseudoStyleTarget,
  property: string,
  value: string,
  previousValue: string | undefined,
  important = false,
  options: PseudoStyleEditCommandOptions = {},
): PseudoStyleEditOperation {
  const elementTarget: ElementRef =
    "selector" in target || "sourceId" in target
      ? (target as ElementRef)
      : { runtimeId: target.runtimeId };
  return {
    id: options.id ?? crypto.randomUUID(),
    kind: "pseudo-style-edit",
    target: elementTarget,
    pseudoTarget,
    property,
    value,
    important,
    timestamp: options.timestamp ?? Date.now(),
    runtime: false,
    origin: options.origin ?? "property-panel",
    confidence: 1,
    ...(previousValue !== undefined ? { previousValue } : {}),
  };
}

interface PseudoElementEditorProps {
  readonly summary: SelectionSummary;
  readonly onCommand: (command: PseudoStyleEditOperation) => void;
  readonly onValidationError?: (error: string | null) => void;
}

export function PseudoElementEditor({
  summary,
  onCommand,
  onValidationError,
}: PseudoElementEditorProps): ReactElement {
  const target = summary.identity;
  const [pseudoTarget, setPseudoTarget] = useState<PseudoStyleTarget>("::before");
  const [property, setProperty] = useState("content");
  const [value, setValue] = useState("");

  const commit = useCallback((): void => {
    const trimmedProperty = property.trim();
    if (trimmedProperty.length === 0) {
      onValidationError?.("Property must not be empty");
      return;
    }
    onValidationError?.(null);
    onCommand(
      createPseudoStyleEditCommand(
        {
          runtimeId: target.runtimeId,
          ...(target.selector !== undefined ? { selector: target.selector } : {}),
        },
        pseudoTarget,
        trimmedProperty,
        value.trim(),
        undefined,
      ),
    );
  }, [property, value, pseudoTarget, target, onCommand, onValidationError]);

  const handleValueKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    },
    [commit],
  );

  return (
    <div className="pseudo-editor">
      <p className="pseudo-editor__hint">
        Edit a pseudo-element or state. The preview synthesizes a stylesheet rule.
      </p>
      <label className="pseudo-editor__field">
        <span className="pseudo-editor__label">Pseudo target</span>
        <select
          className="pseudo-editor__select"
          value={pseudoTarget}
          onChange={(event) => setPseudoTarget(event.target.value as PseudoStyleTarget)}
        >
          {PSEUDO_TARGETS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="pseudo-editor__field">
        <span className="pseudo-editor__label">Property</span>
        <input
          type="text"
          className="pseudo-editor__input"
          value={property}
          onChange={(event) => setProperty(event.target.value)}
        />
      </label>
      <label className="pseudo-editor__field">
        <span className="pseudo-editor__label">Value</span>
        <input
          type="text"
          className="pseudo-editor__input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleValueKeyDown}
        />
      </label>
      <button type="button" className="pseudo-editor__apply" onClick={commit}>
        Apply
      </button>
    </div>
  );
}
