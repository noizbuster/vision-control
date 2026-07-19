import type { DurableElementRef, ResizeFlexPairOperation } from "@vision-control/change-ir";
import type { Rect } from "@vision-control/geometry";

import {
  createBrowserVerificationDomAdapter,
  type DirectChildSnapshot,
  type VerificationDomAdapter,
} from "../dom-adapter.js";
import type { ResolvedTarget } from "../types.js";

const durableRef = (
  runtimeId: string,
  selector: string,
  occurrence: number,
  fingerprint: string,
  sourceId: string,
) => ({ runtimeId, selector, occurrence, fingerprint, sourceId });

const flexState = (flexBasis: string, usedMainSize: number) => ({
  flex: { flexGrow: "0", flexShrink: "0", flexBasis },
  usedMainSize,
});

export function makeFlexVerificationOperation(): ResizeFlexPairOperation {
  const primary = durableRef("old-primary", ".card", 1, "shared-card-fp", "primary-src");
  const neighbor = durableRef("old-neighbor", ".card", 0, "shared-card-fp", "neighbor-src");
  return {
    id: "op-flex-verify-001",
    timestamp: 0,
    runtime: false,
    origin: "canvas-drag",
    confidence: 1,
    kind: "resize-flex-pair",
    target: primary,
    container: durableRef("old-row", "#row", 0, "row-fp", "row-src"),
    members: [
      {
        role: "primary",
        element: primary,
        before: flexState("200px", 200),
        after: flexState("240px", 240),
      },
      {
        role: "neighbor",
        element: neighbor,
        before: flexState("180px", 180),
        after: flexState("140px", 140),
      },
    ],
    containerWitness: {
      before: { x: 10, y: 20, width: 600, height: 80 },
      after: { x: 10, y: 20, width: 600, height: 80 },
    },
    witnesses: [
      {
        element: durableRef("old-witness", ".card", 2, "shared-card-fp", "witness-src"),
        before: { x: 390, y: 20, width: 200, height: 80 },
        after: { x: 390, y: 20, width: 200, height: 80 },
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
  };
}

export function withNeighborIdentity(
  operation: ResizeFlexPairOperation,
  changes: Partial<DurableElementRef>,
): ResizeFlexPairOperation {
  return {
    ...operation,
    members: [
      operation.members[0],
      {
        ...operation.members[1],
        element: { ...operation.members[1].element, ...changes },
      },
    ],
  };
}

export type FlexDomAdapter = VerificationDomAdapter & {
  readonly getDirectChildren: (element: Element) => DirectChildSnapshot;
};

export interface FlexDomFixture {
  readonly dom: FlexDomAdapter;
  readonly container: Element;
  readonly primary: Element;
  readonly neighbor: Element;
  readonly witness: Element;
  readonly setRect: (element: Element, rect: Rect) => void;
}

const rectKey = (element: Element): string => element.getAttribute("data-key") ?? "";

export function installFlexVerificationDom(runtimePrefix = "new"): FlexDomFixture {
  document.body.innerHTML = `
    <div id="row" data-vc-source="row-src" data-vc-runtime-id="${runtimePrefix}-row"
         style="display:flex;position:static" data-key="container">
      <div class="card" data-vc-source="neighbor-src" data-vc-runtime-id="${runtimePrefix}-neighbor"
           style="display:block;position:static;flex-grow:0;flex-shrink:0;flex-basis:140px"
           data-key="neighbor"></div>
      <div class="card" data-vc-source="primary-src" data-vc-runtime-id="${runtimePrefix}-primary"
           style="display:block;position:static;flex-grow:0;flex-shrink:0;flex-basis:240px"
           data-key="primary"></div>
      <div class="card" data-vc-source="witness-src" data-vc-runtime-id="${runtimePrefix}-witness"
           style="display:block;position:static" data-key="witness"></div>
    </div>
  `;
  const container = document.querySelector("#row");
  const primary = document.querySelector('[data-key="primary"]');
  const neighbor = document.querySelector('[data-key="neighbor"]');
  const witness = document.querySelector('[data-key="witness"]');
  if (container === null || primary === null || neighbor === null || witness === null) {
    throw new Error("test setup: flex DOM incomplete");
  }

  const rects = new Map<string, Rect>([
    ["container", { x: 10, y: 20, width: 600, height: 80 }],
    ["neighbor", { x: 10, y: 20, width: 140, height: 80 }],
    ["primary", { x: 150, y: 20, width: 240, height: 80 }],
    ["witness", { x: 390, y: 20, width: 200, height: 80 }],
  ]);
  const browser = createBrowserVerificationDomAdapter({ captureConsole: false });
  const dom: FlexDomAdapter = {
    ...browser,
    getRect: (element) => rects.get(rectKey(element)) ?? { x: 0, y: 0, width: 0, height: 0 },
    computeFingerprint: (element) =>
      rectKey(element) === "container" ? "row-fp" : "shared-card-fp",
    getDirectChildren: (element) => ({
      elements: Array.from(element.children),
      hasNonWhitespaceText: Array.from(element.childNodes).some(
        (node) => node.nodeType === 3 && (node.textContent?.trim().length ?? 0) > 0,
      ),
    }),
  };
  return {
    dom,
    container,
    primary,
    neighbor,
    witness,
    setRect: (element, rect) => rects.set(rectKey(element), rect),
  };
}

export function flexResolvedTarget(fixture: FlexDomFixture): ResolvedTarget {
  return {
    element: fixture.primary,
    dom: fixture.dom,
    runtimeId: "new-primary",
    sourceId: "primary-src",
    selector: ".card",
    confidence: "high",
  };
}
