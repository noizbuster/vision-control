import type { Operation, RemoveElementOperation } from "@vision-control/change-ir";
import { createDeleteCommand, type SelectionSummary } from "@vision-control/inspector-core";
import type { ReactElement } from "react";

interface ElementActionsProps {
  readonly summary: SelectionSummary;
  readonly onCommand: (command: Operation) => void;
}

const INTERNAL_ATTRIBUTE_PREFIX = "data-vc-";

function attributesForDelete(
  attributes: SelectionSummary["attributes"],
): Readonly<Record<string, string>> | undefined {
  const captured: Record<string, string> = {};
  for (const attribute of attributes) {
    if (attribute.name.startsWith(INTERNAL_ATTRIBUTE_PREFIX)) continue;
    captured[attribute.name] = attribute.value;
  }
  return Object.keys(captured).length === 0 ? undefined : captured;
}

export function createDeleteOperationFromSummary(
  summary: SelectionSummary,
): RemoveElementOperation | null {
  const parent = summary.siblingSummary.parent;
  if (parent === undefined) return null;
  const attributes = attributesForDelete(summary.attributes);

  return createDeleteCommand({
    element: summary.identity,
    parent,
    index: summary.siblingSummary.index,
    tagName: summary.identity.tagName,
    ...(attributes !== undefined ? { attributes } : {}),
  });
}

export function ElementActions({ summary, onCommand }: ElementActionsProps): ReactElement {
  const canDelete = summary.siblingSummary.parent !== undefined;

  const onDelete = (): void => {
    const operation = createDeleteOperationFromSummary(summary);
    if (operation === null) return;
    onCommand(operation);
  };

  return (
    <div className="inspector-actions">
      <button
        type="button"
        className="inspector-actions__button inspector-actions__button--danger"
        disabled={!canDelete}
        onClick={onDelete}
      >
        Delete element
      </button>
      {!canDelete && (
        <p className="inspector-actions__hint">Select a DOM element with a parent to delete it.</p>
      )}
    </div>
  );
}
