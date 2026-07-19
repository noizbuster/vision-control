import type {
  DurableElementRef,
  ElementRef,
  FlexMemberState,
  Operation,
  ResizeFlexPairOperation,
} from "@vision-control/change-ir";
import type { JournalEntry } from "@vision-control/change-journal";

function formatElementRef(ref: ElementRef): string {
  const source = ref.sourceId !== undefined ? ` sourceId=${ref.sourceId}` : "";
  const selector = ref.selector !== undefined ? ` selector=${ref.selector}` : "";
  return `${ref.runtimeId}${source}${selector}`;
}

function formatElementRefs(refs: readonly ElementRef[]): string {
  return refs.map(formatElementRef).join(", ");
}

function formatValueWithUnit(value: string, unit: string): string {
  return value.endsWith(unit) ? value : `${value}${unit}`;
}

function formatDurableElementRef(ref: DurableElementRef): string {
  return `${formatElementRef(ref)} occurrence=${ref.occurrence} fingerprint=${ref.fingerprint}`;
}

function formatFlexState(state: FlexMemberState): string {
  const { flex } = state;
  return `${flex.flexGrow} ${flex.flexShrink} ${flex.flexBasis} at ${state.usedMainSize}px`;
}

function formatRect(rect: ResizeFlexPairOperation["containerWitness"]["before"]): string {
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

function assertNeverOperation(value: never): never {
  throw new Error(`Unhandled operation kind in agent prompt: ${JSON.stringify(value)}`);
}

function sortedEntries(entries: readonly JournalEntry[]): readonly JournalEntry[] {
  return [...entries].sort((left, right) => left.sequence - right.sequence);
}

function formatVerificationItem(entry: JournalEntry, index: number): string {
  const op: Operation = entry.operation;
  const label = `${index + 1}. ${op.kind}`;

  switch (op.kind) {
    case "style-edit":
      return `- ${label}: verify ${formatElementRef(op.target)} has CSS ${op.property}: ${op.value}${op.important ? " !important" : ""}.`;
    case "breakpoint-style-edit":
      return `- ${label}: verify ${formatElementRef(op.target)} has breakpoint ${op.breakpoint} CSS ${op.property}: ${op.value}${op.important ? " !important" : ""}.`;
    case "pseudo-style-edit":
      return `- ${label}: verify ${formatElementRef(op.target)} ${op.pseudoTarget} has CSS ${op.property}: ${op.value}${op.important ? " !important" : ""}.`;
    case "remove-style":
      return `- ${label}: verify ${formatElementRef(op.target)} no longer has CSS ${op.property}.`;
    case "class-add":
      return `- ${label}: verify ${formatElementRef(op.target)} includes class ${op.className}.`;
    case "class-remove":
      return `- ${label}: verify ${formatElementRef(op.target)} does not include class ${op.className}.`;
    case "class-replace":
      return `- ${label}: verify ${formatElementRef(op.target)} uses class ${op.newClassName} instead of ${op.oldClassName}.`;
    case "breakpoint-class-edit":
      return `- ${label}: verify ${formatElementRef(op.target)} uses breakpoint ${op.breakpoint} class ${op.newClassName} instead of ${op.oldClassName}.`;
    case "text-edit":
      return `- ${label}: verify ${formatElementRef(op.target)} text content is ${JSON.stringify(op.newText)}.`;
    case "breakpoint-text-edit":
      return `- ${label}: verify ${formatElementRef(op.target)} text content is ${JSON.stringify(op.newText)} at breakpoint ${op.breakpoint}.`;
    case "set-attribute":
      return `- ${label}: verify ${formatElementRef(op.target)} attribute ${op.name} is ${JSON.stringify(op.value)}.`;
    case "position-element":
      return `- ${label}: verify ${formatElementRef(op.target)} CSS position changes from ${op.fromValue} to ${op.toValue}.`;
    case "resize-element":
      return `- ${label}: verify ${formatElementRef(op.element)} CSS ${op.property} changes from ${formatValueWithUnit(op.fromValue, op.unit)} to ${formatValueWithUnit(op.toValue, op.unit)}.`;
    case "resize-flex-pair": {
      const [primary, neighbor] = op.members;
      const witnesses = op.witnesses
        .map(
          (witness) =>
            `${formatDurableElementRef(witness.element)} ${formatRect(witness.before)}->${formatRect(witness.after)}`,
        )
        .join("; ");
      return `- ${label}: verify primary ${formatDurableElementRef(primary.element)} ${formatFlexState(primary.before)} -> ${formatFlexState(primary.after)}; neighbor ${formatDurableElementRef(neighbor.element)} ${formatFlexState(neighbor.before)} -> ${formatFlexState(neighbor.after)}; container ${formatDurableElementRef(op.container)} ${formatRect(op.containerWitness.before)}->${formatRect(op.containerWitness.after)}; axis ${op.axis.writingMode}/${op.axis.direction}/${op.axis.flexDirection}/${op.axis.logicalAxis}/${op.axis.physicalAxis}/${op.axis.directionSign}/${op.axis.handleBoundary}; delta ${op.delta}px; witnesses ${op.witnesses.length}: ${witnesses}.`;
    }
    case "reorder-child":
      return `- ${label}: verify child ${formatElementRef(op.child)} moves within parent ${formatElementRef(op.parent)} from index ${op.fromIndex} to ${op.toIndex}.`;
    case "reparent-element":
      return `- ${label}: verify ${formatElementRef(op.element)} moves from ${formatElementRef(op.sourceParent)}[${op.sourceIndex}] to ${formatElementRef(op.targetParent)}[${op.targetIndex}].`;
    case "set-container-layout":
      return `- ${label}: verify container ${formatElementRef(op.container)} has ${op.property}: ${op.value}.`;
    case "set-child-sizing":
      return `- ${label}: verify child ${formatElementRef(op.child)} in container ${formatElementRef(op.container)} uses ${op.sizing} sizing${op.value === undefined ? "" : ` (${op.value})`}.`;
    case "grid-reorder":
      return `- ${label}: verify grid child ${formatElementRef(op.child)} moves from index ${op.fromIndex} to ${op.toIndex} using ${op.placement}.`;
    case "grid-span":
      return `- ${label}: verify grid child ${formatElementRef(op.child)} ${op.axis} span changes from ${op.fromSpan} to ${op.toSpan}.`;
    case "multi-select-group":
      return `- ${label}: verify selection group ${op.groupId} contains ${formatElementRefs(op.targets)}.`;
    case "group-reorder":
      return `- ${label}: verify children ${formatElementRefs(op.children)} reorder within parent ${formatElementRef(op.parent)} from [${op.previousOrder.join(", ")}] to [${op.newOrder.join(", ")}].`;
    case "group-reparent":
      return `- ${label}: verify elements ${formatElementRefs(op.elements)} move from ${formatElementRef(op.sourceParent)}[${op.sourceIndices.join(", ")}] to ${formatElementRef(op.targetParent)}[${op.targetIndices.join(", ")}].`;
    case "align-elements":
      return `- ${label}: verify ${formatElementRefs(op.targets)} align to ${op.alignment}; values change from [${op.previousValues.join(", ")}] to [${op.newValues.join(", ")}].`;
    case "distribute-elements":
      return `- ${label}: verify ${formatElementRefs(op.targets)} distribute on the ${op.axis} axis with ${op.mode}; gaps change from [${op.previousGaps.join(", ")}] to [${op.newGaps.join(", ")}].`;
    case "insert-element":
      return `- ${label}: verify <${op.tagName}> ${formatElementRef(op.element)} is inserted in ${formatElementRef(op.parent)} at index ${op.index}.`;
    case "remove-element":
      return `- ${label}: verify <${op.tagName}> ${formatElementRef(op.element)} is removed from ${formatElementRef(op.parent)} at index ${op.index}.`;
    case "duplicate-element":
      return `- ${label}: verify ${formatElementRef(op.source)} is duplicated as <${op.tagName}> ${formatElementRef(op.duplicate)} in ${formatElementRef(op.parent)} at index ${op.index}.`;
    case "wrap-elements":
      return `- ${label}: verify ${formatElementRefs(op.targets)} are wrapped by <${op.tagName}> ${formatElementRef(op.wrapper)} under ${formatElementRef(op.parent)}.`;
    case "unwrap-element":
      return `- ${label}: verify wrapper <${op.tagName}> ${formatElementRef(op.wrapper)} is removed and ${formatElementRefs(op.targets)} are promoted under ${formatElementRef(op.parent)}.`;
    case "screenshot-crop-ref":
      return `- ${label}: verify screenshot crop artifact ${op.artifactId} remains metadata-only and its redaction report is respected.`;
    case "suggested-diff":
      return `- ${label}: review the inert suggested diff (${op.sourceRanges.length} source range(s), ${op.confidence} confidence) and apply only through an explicit source patch if accepted.`;
    case "set-component-prop":
      return `- ${label}: verify ${op.componentName}.${op.propName} is ${JSON.stringify(op.value)} at source range ${op.sourceRange.startLine}:${op.sourceRange.startColumn}-${op.sourceRange.endLine}:${op.sourceRange.endColumn}.`;
    default:
      return assertNeverOperation(op);
  }
}

export function formatVerificationPlan(entries: readonly JournalEntry[]): string {
  if (entries.length === 0) {
    return "- No journal entries yet. After source edits, verify the selected element context still resolves on the inspected URL.";
  }

  return [
    "- Rebuild or let HMR reload the inspected page URL after applying source edits.",
    "- Clear runtime previews before judging the result.",
    ...sortedEntries(entries).map(formatVerificationItem),
    "- Confirm the final source, not only the current runtime preview, produces the expected page state.",
  ].join("\n");
}
