/**
 * Test helpers: operation factories and DOM setup utilities.
 */

import type { ElementRef, Operation } from "@vision-control/change-ir";

let opCounter = 0;

export function resetOpCounter(): void {
  opCounter = 0;
}

function makeOpId(prefix: string): string {
  opCounter += 1;
  return `${prefix}-${opCounter.toString().padStart(4, "0")}`;
}

export function elementRef(runtimeId: string): ElementRef {
  return { runtimeId };
}

export function makeStyleEdit(
  target: ElementRef,
  property: string,
  value: string,
): Extract<Operation, { kind: "style-edit" }> {
  return {
    id: makeOpId("style"),
    kind: "style-edit",
    target,
    property,
    value,
    important: false,
    timestamp: 0,
    runtime: false,
  };
}

export function makeTextEdit(
  target: ElementRef,
  newText: string,
): Extract<Operation, { kind: "text-edit" }> {
  return {
    id: makeOpId("text"),
    kind: "text-edit",
    target,
    newText,
    timestamp: 0,
    runtime: false,
  };
}

export function makeClassAdd(
  target: ElementRef,
  className: string,
): Extract<Operation, { kind: "class-add" }> {
  return {
    id: makeOpId("cls"),
    kind: "class-add",
    target,
    className,
    timestamp: 0,
    runtime: false,
  };
}

export function makeClassRemove(
  target: ElementRef,
  className: string,
): Extract<Operation, { kind: "class-remove" }> {
  return {
    id: makeOpId("clr"),
    kind: "class-remove",
    target,
    className,
    timestamp: 0,
    runtime: false,
  };
}

export function makeClassReplace(
  target: ElementRef,
  oldClassName: string,
  newClassName: string,
): Extract<Operation, { kind: "class-replace" }> {
  return {
    id: makeOpId("cre"),
    kind: "class-replace",
    target,
    oldClassName,
    newClassName,
    timestamp: 0,
    runtime: false,
  };
}

export function makeReorder(
  parent: ElementRef,
  child: ElementRef,
  fromIndex: number,
  toIndex: number,
): Extract<Operation, { kind: "reorder-child" }> {
  return {
    id: makeOpId("reo"),
    kind: "reorder-child",
    parent,
    child,
    fromIndex,
    toIndex,
    timestamp: 0,
    runtime: false,
  };
}

export function makeResize(
  element: ElementRef,
  property: "width" | "height",
  fromValue: string,
  toValue: string,
  unit: string,
): Extract<Operation, { kind: "resize-element" }> {
  return {
    id: makeOpId("rsz"),
    kind: "resize-element",
    element,
    property,
    fromValue,
    toValue,
    unit,
    timestamp: 0,
    runtime: false,
  };
}

export function makeReparent(
  element: ElementRef,
  sourceParent: ElementRef,
  sourceIndex: number,
  targetParent: ElementRef,
  targetIndex: number,
): Extract<Operation, { kind: "reparent-element" }> {
  return {
    id: makeOpId("rpt"),
    kind: "reparent-element",
    element,
    sourceParent,
    sourceIndex,
    targetParent,
    targetIndex,
    timestamp: 0,
    runtime: false,
  };
}

/** A preview clearer stub where clearAll actually clears. */
export function makeCleanPreviewClearer(): {
  clearAll: () => void;
  activeCount: number;
} {
  return {
    activeCount: 0,
    clearAll() {
      this.activeCount = 0;
    },
  };
}

/** A preview clearer stub where clearAll is a no-op (preview stays active). */
export function makeStuckPreviewClearer(active: number): {
  clearAll: () => void;
  activeCount: number;
} {
  return {
    activeCount: active,
    clearAll() {
      // Intentionally does nothing — simulates a preview that refuses to clear.
    },
  };
}
