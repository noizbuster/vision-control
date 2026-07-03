/**
 * Test helpers: operation factories, fake DOM adapter, fake MutationObserver,
 * and recording ghost renderer.
 */

import type {
  ClassAddOperation,
  ClassRemoveOperation,
  ElementRef,
  ReorderChildOperation,
  ReparentElementOperation,
  StyleEditOperation,
  TextEditOperation,
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
