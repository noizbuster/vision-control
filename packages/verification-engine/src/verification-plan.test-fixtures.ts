import type { ElementRef } from "@vision-control/change-ir";

import type { VerificationDomAdapter } from "./dom-adapter.js";
import type { ResolvedTarget } from "./types.js";

export const PLAN_OPERATION_BASE = {
  id: "op-plan-test-0001",
  timestamp: 0,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
} as const;

export const planRef = (runtimeId: string): ElementRef => ({ runtimeId });

export function fakePlanTarget(): ResolvedTarget {
  const element = document.createElement("div");
  const dom: VerificationDomAdapter = {
    querySelector: () => null,
    querySelectorAll: () => [],
    getText: () => "hello",
    getClasses: () => ["text-sm"],
    getStyle: (_element, property) => (property === "color" ? "red" : "1rem"),
    getRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
    getParent: () => null,
    getDirectChildren: () => ({ elements: [], hasNonWhitespaceText: false }),
    getSiblingIndex: () => 2,
    getAttribute: () => null,
    isConnected: () => true,
    matchesSelector: () => false,
    computeFingerprint: () => "fp",
    getConsoleEntries: () => [],
  };
  return { element, dom, runtimeId: "rt-1", confidence: "high" };
}

export interface MockPlanTarget {
  readonly identity: string;
  readonly domIndex: number;
  readonly rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export function planTargetWithGroup(mocks: readonly MockPlanTarget[]): ResolvedTarget {
  const meta = new Map<
    Element,
    { readonly domIndex: number; readonly rect: MockPlanTarget["rect"] }
  >();
  const byRuntimeId = new Map<string, Element>();
  for (const mock of mocks) {
    const element = document.createElement("div");
    meta.set(element, { domIndex: mock.domIndex, rect: mock.rect });
    byRuntimeId.set(mock.identity, element);
  }
  const dom: VerificationDomAdapter = {
    querySelector: (selector) => {
      const match = selector.match(/data-vc-runtime-id="([^"]+)"/);
      const runtimeId = match?.[1];
      return runtimeId === undefined ? null : (byRuntimeId.get(runtimeId) ?? null);
    },
    querySelectorAll: () => [],
    getText: () => "",
    getClasses: () => [],
    getStyle: () => "",
    getRect: (element) => meta.get(element)?.rect ?? { x: 0, y: 0, width: 0, height: 0 },
    getParent: () => null,
    getDirectChildren: () => ({ elements: [], hasNonWhitespaceText: false }),
    getSiblingIndex: (element) => meta.get(element)?.domIndex ?? 0,
    getAttribute: () => null,
    isConnected: () => true,
    matchesSelector: () => false,
    computeFingerprint: () => "fp",
    getConsoleEntries: () => [],
  };
  return {
    element: document.createElement("div"),
    dom,
    runtimeId: "rt-primary",
    confidence: "high",
  };
}
