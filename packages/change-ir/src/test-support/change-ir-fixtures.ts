import type { ChangeSet, Operation, ReorderChildOperation } from "../index.js";

export const BASE_TIME = 1_700_000_000_000;
export const elementRef = (runtimeId: string) => ({ runtimeId });
export const operationDefaults = { origin: "property-panel" as const, confidence: 1 };

export const legacy20Defaults = {
  schemaVersion: "2.0.0" as const,
  workspaceId: "ws-test-0001",
  page: { url: "https://localhost/page", title: null },
  viewport: { width: 1280, height: 720 },
  selectedTargets: [],
  sourceResolutions: [],
  verificationPlan: { assertions: [], notes: "test plan" },
  privacyReport: { redactions: [], totalRedacted: 0 },
};

export const styleEdit = (): Operation => ({
  id: "op-style-00001",
  timestamp: BASE_TIME,
  runtime: false,
  ...operationDefaults,
  kind: "style-edit",
  target: elementRef("btn-primary"),
  property: "color",
  value: "blue",
  important: false,
  previousValue: "red",
});

export const reorderOperation: ReorderChildOperation = {
  id: "op-reorder0001",
  timestamp: BASE_TIME + 1,
  runtime: false,
  ...operationDefaults,
  kind: "reorder-child",
  parent: elementRef("row-1"),
  child: elementRef("card-c"),
  fromIndex: 2,
  toIndex: 0,
};

export const reparentOperation: Operation = {
  id: "op-reparent001",
  timestamp: BASE_TIME + 2,
  runtime: false,
  ...operationDefaults,
  kind: "reparent-element",
  element: elementRef("card-c"),
  sourceParent: elementRef("row-1"),
  sourceIndex: 1,
  targetParent: elementRef("row-2"),
  targetIndex: 0,
};

export const resizeOperation: Operation = {
  id: "op-resize00001",
  timestamp: BASE_TIME + 3,
  runtime: false,
  ...operationDefaults,
  kind: "resize-element",
  element: elementRef("card-c"),
  property: "width",
  fromValue: "200",
  toValue: "320",
  unit: "px",
};

const durableRef = (runtimeId: string, selector: string, occurrence: number) => ({
  runtimeId,
  selector,
  occurrence,
  fingerprint: `fingerprint-${runtimeId}`,
});
const rect = (x: number, width: number) => ({ x, y: 20, width, height: 80 });
const flexState = (flexGrow: string, flexBasis: string, usedMainSize: number) => ({
  flex: { flexGrow, flexShrink: "1", flexBasis },
  usedMainSize,
});

export const flexPairOperation = () => {
  const primary = durableRef("card-primary", ".card", 0);
  const neighbor = durableRef("card-neighbor", ".card", 1);
  return {
    id: "op-flex-pair-001",
    timestamp: BASE_TIME,
    runtime: false,
    origin: "canvas-drag",
    confidence: 1,
    kind: "resize-flex-pair",
    target: primary,
    container: durableRef("card-container", ".row", 0),
    members: [
      {
        role: "primary",
        element: primary,
        before: flexState("1", "auto", 200),
        after: flexState("0", "240px", 240),
      },
      {
        role: "neighbor",
        element: neighbor,
        before: flexState("2", "180px", 180),
        after: flexState("0", "140px", 140),
      },
    ],
    containerWitness: { before: rect(0, 600), after: rect(0, 600) },
    witnesses: [
      {
        element: durableRef("card-witness", ".card", 2),
        before: rect(400, 200),
        after: rect(400, 200),
      },
    ],
    axis: {
      writingMode: "horizontal-tb",
      direction: "ltr",
      flexDirection: "row",
      logicalAxis: "inline",
      physicalAxis: "x",
      directionSign: 1,
      handleBoundary: "main-end",
    },
    delta: 40,
  } as const;
};

export const changeSetWith = (id: string, operations: readonly Operation[]): ChangeSet => ({
  ...legacy20Defaults,
  schemaVersion: "2.1.0",
  id,
  sessionId: "sess-merge-0001",
  operations: [...operations],
  createdAt: BASE_TIME,
  updatedAt: BASE_TIME,
  committed: false,
});

const structuralBase = (id: string, timestamp: number) => ({
  id,
  timestamp,
  runtime: false,
  ...operationDefaults,
});

export const insertOperation = (elementId: string): Operation => ({
  ...structuralBase(`op-ins-${elementId}`, BASE_TIME),
  kind: "insert-element",
  element: elementRef(elementId),
  parent: elementRef("row-1"),
  index: 0,
  tagName: "div",
  attributes: { class: "card" },
});

export const removeElementOperation = (elementId: string): Operation => ({
  ...structuralBase(`op-rem-${elementId}`, BASE_TIME + 1),
  kind: "remove-element",
  element: elementRef(elementId),
  parent: elementRef("row-1"),
  index: 2,
  tagName: "span",
});

export const duplicateOperation = (sourceId: string, copyId: string): Operation => ({
  ...structuralBase(`op-dup-${copyId}`, BASE_TIME + 2),
  kind: "duplicate-element",
  source: elementRef(sourceId),
  duplicate: elementRef(copyId),
  parent: elementRef("row-1"),
  index: 1,
  tagName: "div",
});

export const wrapOperation = (wrapperId: string): Operation => ({
  ...structuralBase(`op-wrp-${wrapperId}`, BASE_TIME + 3),
  kind: "wrap-elements",
  targets: [elementRef("card-a"), elementRef("card-b")],
  wrapper: elementRef(wrapperId),
  parent: elementRef("row-1"),
  tagName: "div",
});

export const unwrapOperation = (wrapperId: string): Operation => ({
  ...structuralBase(`op-unw-${wrapperId}`, BASE_TIME + 4),
  kind: "unwrap-element",
  wrapper: elementRef(wrapperId),
  parent: elementRef("row-1"),
  tagName: "section",
  targets: [elementRef("card-a"), elementRef("card-b")],
});
