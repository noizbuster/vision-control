import type { Operation } from "@vision-control/change-ir";

export const BASE_TIME = 1_700_000_000_000;

export const styleEdit = (value: string, previousValue = "8px"): Operation => ({
  id: "op-style-0001",
  timestamp: BASE_TIME,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  kind: "style-edit",
  target: { runtimeId: "btn-1" },
  property: "padding",
  value,
  important: false,
  previousValue,
});

export const classAdd = (className: string): Operation => ({
  id: "op-class-add1",
  timestamp: BASE_TIME,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  kind: "class-add",
  target: { runtimeId: "btn-1" },
  className,
});

export const classRemove = (className: string): Operation => ({
  id: "op-class-rem1",
  timestamp: BASE_TIME,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  kind: "class-remove",
  target: { runtimeId: "btn-1" },
  className,
});

export const textEdit = (newText: string, previousText = "Hello"): Operation => ({
  id: "op-text-edit1",
  timestamp: BASE_TIME,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  kind: "text-edit",
  target: { runtimeId: "btn-1" },
  newText,
  previousText,
});

export const resize = (fromValue: string, toValue: string): Operation => ({
  id: "op-resize-0001",
  timestamp: BASE_TIME,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  kind: "resize-element",
  element: { runtimeId: "btn-1" },
  property: "width",
  fromValue,
  toValue,
  unit: "px",
});

export const reorder = (fromIndex: number, toIndex: number): Operation => ({
  id: "op-reorder-0001",
  timestamp: BASE_TIME,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  kind: "reorder-child",
  parent: { runtimeId: "row-1" },
  child: { runtimeId: "btn-1" },
  fromIndex,
  toIndex,
});

export const removeElement = (): Operation => ({
  id: "op-remove-el1",
  timestamp: BASE_TIME,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
  kind: "remove-element",
  element: { runtimeId: "btn-1" },
  parent: { runtimeId: "row-1" },
  index: 2,
  tagName: "button",
});
