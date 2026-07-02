/**
 * Command factories for panel editors.
 *
 * These factories build change-ir operations WITHOUT mutating a ChangeSet. The
 * caller (the React panel) sends the returned operation to the journal via the
 * message bus; task 18 wires the journal to apply it to a ChangeSet.
 */

import type {
  ClassAddOperation,
  ClassRemoveOperation,
  ClassReplaceOperation,
  ElementRef,
  StyleEditOperation,
  TextEditOperation,
} from "@vision-control/change-ir";

/** Options shared by every command factory. */
interface CommandBaseOptions {
  /** Epoch timestamp; defaults to `Date.now()`. */
  readonly timestamp?: number;
  /** Operation id; defaults to `crypto.randomUUID()`. */
  readonly id?: string;
}

function newOperationId(): string {
  return crypto.randomUUID();
}

function commandBase(options: CommandBaseOptions): {
  id: string;
  timestamp: number;
  runtime: false;
} {
  return {
    id: options.id ?? newOperationId(),
    timestamp: options.timestamp ?? Date.now(),
    runtime: false,
  };
}

function toElementRef(target: ElementRef | { readonly runtimeId: string }): ElementRef {
  return "selector" in target || "sourceId" in target
    ? (target as ElementRef)
    : { runtimeId: target.runtimeId };
}

/** Create a {@link StyleEditOperation} for setting an inline style property. */
export function createStyleEditCommand(
  target: ElementRef,
  property: string,
  value: string,
  previousValue: string | undefined,
  options: CommandBaseOptions = {},
): StyleEditOperation {
  return {
    ...commandBase(options),
    kind: "style-edit",
    target: toElementRef(target),
    property,
    value,
    important: false,
    ...(previousValue !== undefined ? { previousValue } : {}),
  };
}

/** Create a {@link ClassAddOperation}. */
export function createClassAddCommand(
  target: ElementRef,
  className: string,
  options: CommandBaseOptions = {},
): ClassAddOperation {
  return {
    ...commandBase(options),
    kind: "class-add",
    target: toElementRef(target),
    className,
  };
}

/** Create a {@link ClassRemoveOperation}. */
export function createClassRemoveCommand(
  target: ElementRef,
  className: string,
  options: CommandBaseOptions = {},
): ClassRemoveOperation {
  return {
    ...commandBase(options),
    kind: "class-remove",
    target: toElementRef(target),
    className,
  };
}

/** Create a {@link ClassReplaceOperation} (remove old + add new in one op). */
export function createClassReplaceCommand(
  target: ElementRef,
  oldClass: string,
  newClass: string,
  options: CommandBaseOptions = {},
): ClassReplaceOperation {
  return {
    ...commandBase(options),
    kind: "class-replace",
    target: toElementRef(target),
    oldClassName: oldClass,
    newClassName: newClass,
  };
}

/** Create a {@link TextEditOperation} for replacing element text content. */
export function createTextEditCommand(
  target: ElementRef,
  newText: string,
  previousText: string | undefined,
  options: CommandBaseOptions = {},
): TextEditOperation {
  return {
    ...commandBase(options),
    kind: "text-edit",
    target: toElementRef(target),
    newText,
    ...(previousText !== undefined ? { previousText } : {}),
  };
}
