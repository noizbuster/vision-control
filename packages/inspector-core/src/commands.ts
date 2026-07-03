/**
 * Style, class, and text command factories for panel editors.
 *
 * These factories build change-ir operations WITHOUT mutating a ChangeSet. The
 * caller (the React panel) sends the returned operation to the journal via the
 * message bus; task 18 wires the journal to apply it to a ChangeSet.
 *
 * Structural commands (duplicate, wrap, free-position, ...) live in sibling
 * modules — see `./structural-commands.js` and `./position-command.js` — and
 * reuse the same shared base helpers from `./command-base.js`.
 */

import type {
  ClassAddOperation,
  ClassRemoveOperation,
  ClassReplaceOperation,
  ElementRef,
  SetAttributeOperation,
  SetComponentPropOperation,
  StyleEditOperation,
  TextEditOperation,
} from "@vision-control/change-ir";

import { type CommandBaseOptions, commandBase, toElementRef } from "./command-base.js";

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

/**
 * Create a {@link SetAttributeOperation} for setting a DOM attribute on the
 * target element (PRD §12.3). Used by the props panel for DOM-attribute props.
 */
export function createSetAttributeCommand(
  target: ElementRef,
  name: string,
  value: string,
  previousValue: string | undefined,
  options: CommandBaseOptions = {},
): SetAttributeOperation {
  return {
    ...commandBase(options),
    kind: "set-attribute",
    target: toElementRef(target),
    name,
    value,
    ...(previousValue !== undefined ? { previousValue } : {}),
  };
}

/**
 * Create a {@link SetComponentPropOperation} for editing a component-level prop
 * (e.g. `variant`, `size`) at a resolved JSX source range (PRD §7.2). The
 * cross-boundary check is the caller's responsibility.
 */
export function createSetComponentPropCommand(
  target: ElementRef,
  componentName: string,
  propName: string,
  value: string,
  previousValue: string | undefined,
  sourceRange: SetComponentPropOperation["sourceRange"],
  options: CommandBaseOptions = {},
): SetComponentPropOperation {
  return {
    ...commandBase(options),
    kind: "set-component-prop",
    target: toElementRef(target),
    componentName,
    propName,
    value,
    ...(previousValue !== undefined ? { previousValue } : {}),
    sourceRange,
  };
}
