/**
 * Test helpers: operation factories, fake DOM adapter, fake MutationObserver,
 * and recording ghost renderer.
 */

import type {
  AlignElementsOperation,
  BreakpointClassEditOperation,
  BreakpointStyleEditOperation,
  BreakpointTextEditOperation,
  ClassAddOperation,
  ClassRemoveOperation,
  DistributeElementsOperation,
  DuplicateElementOperation,
  ElementRef,
  GridReorderOperation,
  GridSpanOperation,
  GroupReorderOperation,
  GroupReparentOperation,
  InsertElementOperation,
  MultiSelectGroupOperation,
  PositionElementOperation,
  RemoveElementOperation,
  RemoveStyleOperation,
  ReorderChildOperation,
  ReparentElementOperation,
  ScreenshotCropRefOperation,
  SetAttributeOperation,
  SetChildSizingOperation,
  SetContainerLayoutOperation,
  StyleEditOperation,
  SuggestedDiffOperation,
  TextEditOperation,
  UnwrapElementOperation,
  WrapElementsOperation,
} from "@vision-control/change-ir";

import type { GhostRenderer, PreviewDomAdapter, PreviewRect } from "../index.js";

const opDefaults = { origin: "property-panel" as const, confidence: 1 };

let opCounter = 0;

function makeOpId(prefix: string): string {
  opCounter += 1;
  return `${prefix}-${opCounter.toString().padStart(4, "0")}`;
}

export function resetOpCounter(): void {
  opCounter = 0;
}

export function elementRef(runtimeId: string): ElementRef {
  return { runtimeId };
}

export function makeStyleEdit(
  runtimeId: string,
  property: string,
  value: string,
  previousValue?: string,
): StyleEditOperation {
  return {
    id: makeOpId("style"),
    kind: "style-edit",
    target: elementRef(runtimeId),
    property,
    value,
    important: false,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
    ...(previousValue !== undefined ? { previousValue } : {}),
  };
}

export function makeClassAdd(runtimeId: string, className: string): ClassAddOperation {
  return {
    id: makeOpId("cadd"),
    kind: "class-add",
    target: elementRef(runtimeId),
    className,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeClassRemove(runtimeId: string, className: string): ClassRemoveOperation {
  return {
    id: makeOpId("crmv"),
    kind: "class-remove",
    target: elementRef(runtimeId),
    className,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeClassReplace(
  runtimeId: string,
  oldClass: string,
  newClass: string,
): import("@vision-control/change-ir").ClassReplaceOperation {
  return {
    id: makeOpId("crep"),
    kind: "class-replace",
    target: elementRef(runtimeId),
    oldClassName: oldClass,
    newClassName: newClass,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeTextEdit(runtimeId: string, newText: string): TextEditOperation {
  return {
    id: makeOpId("text"),
    kind: "text-edit",
    target: elementRef(runtimeId),
    newText,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeReorder(
  parentId: string,
  childId: string,
  fromIndex: number,
  toIndex: number,
): ReorderChildOperation {
  return {
    id: makeOpId("reord"),
    kind: "reorder-child",
    parent: elementRef(parentId),
    child: elementRef(childId),
    fromIndex,
    toIndex,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeReparent(
  elementId: string,
  sourceParentId: string,
  sourceIndex: number,
  targetParentId: string,
  targetIndex: number,
): ReparentElementOperation {
  return {
    id: makeOpId("repa"),
    kind: "reparent-element",
    element: elementRef(elementId),
    sourceParent: elementRef(sourceParentId),
    sourceIndex,
    targetParent: elementRef(targetParentId),
    targetIndex,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeRuntimeStyleEdit(
  runtimeId: string,
  property: string,
  value: string,
): StyleEditOperation {
  return {
    id: makeOpId("rtst"),
    kind: "style-edit",
    target: elementRef(runtimeId),
    property,
    value,
    important: true,
    timestamp: 0,
    runtime: true,
    ...opDefaults,
  };
}

export function makeRemoveStyle(
  runtimeId: string,
  property: string,
  previousValue?: string,
): RemoveStyleOperation {
  return {
    id: makeOpId("rmst"),
    kind: "remove-style",
    target: elementRef(runtimeId),
    property,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
    ...(previousValue !== undefined ? { previousValue } : {}),
  };
}

export function makeSetAttribute(
  runtimeId: string,
  name: string,
  value: string,
  previousValue?: string,
): SetAttributeOperation {
  return {
    id: makeOpId("attr"),
    kind: "set-attribute",
    target: elementRef(runtimeId),
    name,
    value,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
    ...(previousValue !== undefined ? { previousValue } : {}),
  };
}

export function makePositionElement(
  runtimeId: string,
  fromValue: string,
  toValue: string,
): PositionElementOperation {
  return {
    id: makeOpId("pos"),
    kind: "position-element",
    target: elementRef(runtimeId),
    property: "position",
    fromValue,
    toValue,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeMultiSelectGroup(
  groupId: string,
  targets: ElementRef[],
  previousTargets?: ElementRef[],
): MultiSelectGroupOperation {
  return {
    id: makeOpId("msg"),
    kind: "multi-select-group",
    targets,
    groupId,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
    ...(previousTargets !== undefined ? { previousTargets } : {}),
  };
}

export function makeGroupReorder(
  parentId: string,
  children: ElementRef[],
  previousOrder: number[],
  newOrder: number[],
): GroupReorderOperation {
  return {
    id: makeOpId("grp"),
    kind: "group-reorder",
    parent: elementRef(parentId),
    children,
    previousOrder,
    newOrder,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeGroupReparent(
  elements: ElementRef[],
  sourceParentId: string,
  sourceIndices: number[],
  targetParentId: string,
  targetIndices: number[],
): GroupReparentOperation {
  return {
    id: makeOpId("grpp"),
    kind: "group-reparent",
    elements,
    sourceParent: elementRef(sourceParentId),
    sourceIndices,
    targetParent: elementRef(targetParentId),
    targetIndices,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeAlignElements(
  targets: ElementRef[],
  alignment: AlignElementsOperation["alignment"],
  previousValues: string[] = [],
  newValues: string[] = [],
): AlignElementsOperation {
  return {
    id: makeOpId("algn"),
    kind: "align-elements",
    targets,
    alignment,
    previousValues,
    newValues,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeDistributeElements(
  targets: ElementRef[],
  axis: DistributeElementsOperation["axis"],
  mode: DistributeElementsOperation["mode"],
  previousGaps: string[] = [],
  newGaps: string[] = [],
): DistributeElementsOperation {
  return {
    id: makeOpId("dstr"),
    kind: "distribute-elements",
    targets,
    axis,
    mode,
    previousGaps,
    newGaps,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeSetContainerLayout(
  containerId: string,
  property: string,
  value: string,
  previousValue?: string,
): SetContainerLayoutOperation {
  return {
    id: makeOpId("scl"),
    kind: "set-container-layout",
    container: elementRef(containerId),
    property,
    value,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
    ...(previousValue !== undefined ? { previousValue } : {}),
  };
}

export function makeSetChildSizing(
  containerId: string,
  childId: string,
  childIndex: number,
  sizing: SetChildSizingOperation["sizing"],
  value?: string,
): SetChildSizingOperation {
  return {
    id: makeOpId("scs"),
    kind: "set-child-sizing",
    container: elementRef(containerId),
    childIndex,
    child: elementRef(childId),
    sizing,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
    ...(value !== undefined ? { value } : {}),
  };
}

export function makeGridReorder(
  gridId: string,
  childId: string,
  placement: GridReorderOperation["placement"],
  fromIndex: number,
  toIndex: number,
  newGridArea?: string,
): GridReorderOperation {
  return {
    id: makeOpId("grr"),
    kind: "grid-reorder",
    grid: elementRef(gridId),
    child: elementRef(childId),
    placement,
    fromIndex,
    toIndex,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
    ...(newGridArea !== undefined ? { newGridArea } : {}),
  };
}

export function makeGridSpan(
  gridId: string,
  childId: string,
  axis: GridSpanOperation["axis"],
  fromSpan: number,
  toSpan: number,
): GridSpanOperation {
  return {
    id: makeOpId("gsp"),
    kind: "grid-span",
    grid: elementRef(gridId),
    child: elementRef(childId),
    axis,
    fromSpan,
    toSpan,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeBreakpointStyleEdit(
  runtimeId: string,
  breakpoint: string,
  property: string,
  value: string,
): BreakpointStyleEditOperation {
  return {
    id: makeOpId("bpse"),
    kind: "breakpoint-style-edit",
    breakpoint,
    target: elementRef(runtimeId),
    property,
    value,
    important: false,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeBreakpointClassEdit(
  runtimeId: string,
  breakpoint: string,
  oldClassName: string,
  newClassName: string,
): BreakpointClassEditOperation {
  return {
    id: makeOpId("bpce"),
    kind: "breakpoint-class-edit",
    breakpoint,
    target: elementRef(runtimeId),
    oldClassName,
    newClassName,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeBreakpointTextEdit(
  runtimeId: string,
  breakpoint: string,
  newText: string,
): BreakpointTextEditOperation {
  return {
    id: makeOpId("bpte"),
    kind: "breakpoint-text-edit",
    breakpoint,
    target: elementRef(runtimeId),
    newText,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeScreenshotCropRef(
  artifactId: string,
  captureRegion: { x: number; y: number; width: number; height: number },
): ScreenshotCropRefOperation {
  return {
    id: makeOpId("scr"),
    kind: "screenshot-crop-ref",
    target: elementRef("rt-screenshot"),
    artifactId,
    captureRegion,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeSuggestedDiff(diff: string): SuggestedDiffOperation {
  return {
    id: makeOpId("sdf"),
    kind: "suggested-diff",
    diff,
    sourceRanges: [],
    preconditions: [],
    applied: false,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
    confidence: "high",
  };
}

export function makeInsertElement(
  elementId: string,
  parentId: string,
  index: number,
  tagName: string,
  attributes?: Record<string, string>,
): InsertElementOperation {
  return {
    id: makeOpId("ins"),
    kind: "insert-element",
    element: elementRef(elementId),
    parent: elementRef(parentId),
    index,
    tagName,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
    ...(attributes !== undefined ? { attributes } : {}),
  };
}

export function makeRemoveElement(
  elementId: string,
  parentId: string,
  index: number,
  tagName: string,
): RemoveElementOperation {
  return {
    id: makeOpId("rem"),
    kind: "remove-element",
    element: elementRef(elementId),
    parent: elementRef(parentId),
    index,
    tagName,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeDuplicateElement(
  sourceId: string,
  duplicateId: string,
  parentId: string,
  index: number,
  tagName: string,
): DuplicateElementOperation {
  return {
    id: makeOpId("dup"),
    kind: "duplicate-element",
    source: elementRef(sourceId),
    duplicate: elementRef(duplicateId),
    parent: elementRef(parentId),
    index,
    tagName,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeWrapElements(
  targetIds: string[],
  wrapperId: string,
  parentId: string,
  tagName: string,
): WrapElementsOperation {
  return {
    id: makeOpId("wrp"),
    kind: "wrap-elements",
    targets: targetIds.map((id) => elementRef(id)),
    wrapper: elementRef(wrapperId),
    parent: elementRef(parentId),
    tagName,
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

export function makeUnwrapElement(
  wrapperId: string,
  parentId: string,
  tagName: string,
  targetIds: string[],
): UnwrapElementOperation {
  return {
    id: makeOpId("unwr"),
    kind: "unwrap-element",
    wrapper: elementRef(wrapperId),
    parent: elementRef(parentId),
    tagName,
    targets: targetIds.map((id) => elementRef(id)),
    timestamp: 0,
    runtime: false,
    ...opDefaults,
  };
}

/** A recording ghost renderer that tracks show/hide calls for assertions. */
export function createRecordingGhostRenderer(): {
  renderer: GhostRenderer;
  showCalls: PreviewRect[];
  hideCalls: number;
} {
  const showCalls: PreviewRect[] = [];
  let hideCalls = 0;
  let visible = false;

  const renderer: GhostRenderer = {
    showGhost: (rect: PreviewRect): void => {
      showCalls.push(rect);
      visible = true;
    },
    hideGhost: (): void => {
      hideCalls += 1;
      visible = false;
    },
    isGhostVisible: (): boolean => visible,
  };

  return { renderer, showCalls, hideCalls };
}

/**
 * Fake MutationObserver that captures the callback and target for manual
 * triggering in tests (simulates React reconciliation revert).
 */
export class FakeMutationObserver {
  callback: MutationCallback | null = null;
  target: Node | null = null;
  static instances: FakeMutationObserver[] = [];

  constructor(cb: MutationCallback) {
    this.callback = cb;
    FakeMutationObserver.instances.push(this);
  }
  observe(target: Node, _options: MutationObserverInit): void {
    this.target = target;
  }
  disconnect(): void {
    this.callback = null;
    this.target = null;
  }
  /** Simulate a framework revert: notify that target was removed from parent. */
  simulateRemoval(removedNode: Node): void {
    if (this.callback === null || this.target === null) return;
    const removedNodes: Node[] = [removedNode];
    const mutation: MutationRecord = {
      type: "childList",
      target: this.target,
      addedNodes: [] as unknown as NodeList,
      removedNodes: removedNodes as unknown as NodeList,
      previousSibling: null,
      nextSibling: null,
      attributeName: null,
      attributeNamespace: null,
      oldValue: null,
    };
    this.callback([mutation], this as unknown as MutationObserver);
  }
}

/** Create a DOM adapter with a fake MutationObserver factory. */
export function createTestDomAdapter(
  mutationObserverCtor: typeof FakeMutationObserver,
  computedStyleValue?: string,
): PreviewDomAdapter {
  const elements = new Map<string, Element>();
  return {
    resolveElement: (id) => elements.get(id) ?? null,
    registerElement: (id, el) => {
      elements.set(id, el);
      el.setAttribute("data-vc-preview-id", id);
    },
    createStyleElement: () => document.createElement("style"),
    appendToHead: (node) => document.head.appendChild(node),
    getComputedStyle: (el) =>
      ({
        getPropertyValue: (prop: string) =>
          computedStyleValue ??
          el
            .getAttribute("style")
            ?.match(new RegExp(`${prop}:\\s*([^;]+)`))?.[1]
            ?.trim() ??
          "",
      }) as CSSStyleDeclaration,
    getRect: (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    },
    createMutationObserver: (cb) => new mutationObserverCtor(cb) as unknown as MutationObserver,
  };
}

/** Helper to apply an operation array and get the child element ids of a parent. */
export function childTexts(parent: Element | null): string[] {
  if (parent === null) return [];
  return Array.from(parent.children).map((c) => c.textContent ?? "");
}
