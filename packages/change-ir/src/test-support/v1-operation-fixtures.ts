import type { Operation } from "../index.js";
import { BASE_TIME, elementRef, operationDefaults } from "./change-ir-fixtures.js";

type OperationOf<Kind extends Operation["kind"]> = Extract<Operation, { readonly kind: Kind }>;

const base = (id: string, offset: number) => ({
  id,
  timestamp: BASE_TIME + offset,
  runtime: false,
  ...operationDefaults,
});

export const multiSelectGroup: OperationOf<"multi-select-group"> = {
  ...base("op-msel-grp001", 0),
  kind: "multi-select-group",
  targets: [elementRef("card-a"), elementRef("card-b"), elementRef("card-c")],
  groupId: "grp-001",
  previousTargets: [elementRef("card-a")],
};

export const groupReorder: OperationOf<"group-reorder"> = {
  ...base("op-grodr-00001", 1),
  kind: "group-reorder",
  parent: elementRef("row-1"),
  children: [elementRef("card-c"), elementRef("card-a"), elementRef("card-b")],
  previousOrder: [0, 1, 2],
  newOrder: [2, 0, 1],
};

export const groupReparent: OperationOf<"group-reparent"> = {
  ...base("op-grepr-00001", 2),
  kind: "group-reparent",
  elements: [elementRef("card-a"), elementRef("card-b")],
  sourceParent: elementRef("row-1"),
  sourceIndices: [0, 1],
  targetParent: elementRef("row-2"),
  targetIndices: [0, 1],
};

export const alignElements: OperationOf<"align-elements"> = {
  ...base("op-align-00001", 3),
  kind: "align-elements",
  targets: [elementRef("card-a"), elementRef("card-b"), elementRef("card-c")],
  alignment: "center",
  previousValues: ["0px", "4px", "8px"],
  newValues: ["4px", "4px", "4px"],
};

export const distributeElements: OperationOf<"distribute-elements"> = {
  ...base("op-distr-00001", 4),
  kind: "distribute-elements",
  targets: [elementRef("card-a"), elementRef("card-b"), elementRef("card-c")],
  axis: "horizontal",
  mode: "space-between",
  previousGaps: ["2px", "2px"],
  newGaps: ["8px", "8px"],
};

export const setContainerLayout: OperationOf<"set-container-layout"> = {
  ...base("op-ctrlay0001", 5),
  kind: "set-container-layout",
  container: elementRef("row-1"),
  property: "flex-direction",
  value: "column",
  previousValue: "row",
};

export const setChildSizing: OperationOf<"set-child-sizing"> = {
  ...base("op-chldsz0001", 6),
  kind: "set-child-sizing",
  container: elementRef("row-1"),
  childIndex: 0,
  child: elementRef("card-a"),
  sizing: "fill",
  previousSizing: "hug",
  value: "flex:1",
  previousValue: "width:auto",
};

export const gridReorder: OperationOf<"grid-reorder"> = {
  ...base("op-gridrd0001", 7),
  kind: "grid-reorder",
  grid: elementRef("grid-1"),
  child: elementRef("cell-3"),
  placement: "grid-area",
  fromIndex: 2,
  toIndex: 0,
  previousGridArea: "1 / 3",
  newGridArea: "1 / 1",
};

export const gridSpan: OperationOf<"grid-span"> = {
  ...base("op-gridsp0001", 8),
  kind: "grid-span",
  grid: elementRef("grid-1"),
  child: elementRef("cell-1"),
  axis: "column",
  fromSpan: 1,
  toSpan: 2,
};

export const breakpointStyleEdit: OperationOf<"breakpoint-style-edit"> = {
  ...base("op-bp-sty0001", 9),
  kind: "breakpoint-style-edit",
  target: elementRef("card-a"),
  breakpoint: "md",
  mediaSource: "@media (min-width: 768px)",
  property: "padding",
  value: "16px",
  important: false,
  previousValue: "8px",
};

export const breakpointClassEdit: OperationOf<"breakpoint-class-edit"> = {
  ...base("op-bp-cls0001", 10),
  kind: "breakpoint-class-edit",
  target: elementRef("card-a"),
  breakpoint: "md",
  oldClassName: "p-2",
  newClassName: "p-4",
};

export const breakpointTextEdit: OperationOf<"breakpoint-text-edit"> = {
  ...base("op-bp-txt0001", 11),
  kind: "breakpoint-text-edit",
  target: elementRef("card-a"),
  breakpoint: "md",
  newText: "Expanded",
  previousText: "Short",
};

export const screenshotCropRef: OperationOf<"screenshot-crop-ref"> = {
  ...base("op-shot-000001", 12),
  kind: "screenshot-crop-ref",
  target: elementRef("card-a"),
  artifactId: "shot-art-0001",
  captureRegion: { x: 0, y: 0, width: 200, height: 80 },
  redactionReport: "redact-report-0001",
  retentionExpiresAt: BASE_TIME + 60_000,
};

export const suggestedDiff: OperationOf<"suggested-diff"> = {
  ...base("op-sdiff-00001", 13),
  kind: "suggested-diff",
  target: elementRef("card-a"),
  diff: "@@ -1,1 +1,1 @@\n-p-2\n+p-4",
  sourceRanges: [{ startLine: 1, startColumn: 0, endLine: 1, endColumn: 3 }],
  confidence: "high",
  preconditions: ["static class string"],
  applied: false,
};

export const pseudoStyleEdit: OperationOf<"pseudo-style-edit"> = {
  ...base("op-pseu-00001", 14),
  kind: "pseudo-style-edit",
  target: elementRef("card-a"),
  pseudoTarget: "::before",
  property: "content",
  value: '"NEW"',
  important: false,
  previousValue: '"OLD"',
};

export const V1_OPERATIONS = [
  multiSelectGroup,
  groupReorder,
  groupReparent,
  alignElements,
  distributeElements,
  setContainerLayout,
  setChildSizing,
  gridReorder,
  gridSpan,
  breakpointStyleEdit,
  breakpointClassEdit,
  breakpointTextEdit,
  screenshotCropRef,
  suggestedDiff,
  pseudoStyleEdit,
] as const;
