import type { Operation } from "@vision-control/change-ir";
import type { MultiSelectGroup } from "@vision-control/editor-core";
import { createMultiSelectGroupId } from "@vision-control/element-identity";
import type { SelectionSummary } from "@vision-control/inspector-core";

import type { SelectionOriginState } from "./hooks/useSelectionSummary.js";

export function setupChromeStubs(theme: "dark" | "light"): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && theme === "dark",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }),
  });

  Object.defineProperty(globalThis, "chrome", {
    writable: true,
    value: {
      devtools: {
        inspectedWindow: { tabId: 42 },
        panels: { themeName: theme === "dark" ? "dark" : "default" },
      },
      runtime: {
        lastError: undefined,
        sendMessage: () => Promise.resolve(),
        onMessage: { addListener: () => {}, removeListener: () => {} },
        connect: () => ({
          onMessage: { addListener: () => {}, removeListener: () => {} },
          onDisconnect: { addListener: () => {}, removeListener: () => {} },
          disconnect: () => {},
          postMessage: () => {},
        }),
      },
      tabs: {
        get: (_tabId: number, callback: (tab: { title?: string; url?: string }) => void) => {
          callback({ title: "Test page", url: "http://localhost:3000/" });
        },
      },
    },
  });
}

export function makeSummary(
  display: SelectionSummary["computedStyle"]["display"],
): SelectionSummary {
  return {
    identity: {
      runtimeId: "runtime-1",
      tagName: "div",
      frameId: "main",
      fingerprint: "abc12345",
      confidence: "high",
      selector: "#container",
    },
    breadcrumb: [
      { tagName: "body", selector: "body" },
      { tagName: "div", selector: "#container" },
    ],
    computedStyle: {
      display,
      position: "static",
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "flex-start",
      flexBasis: "auto",
      flexGrow: "0",
      width: "auto",
      height: "auto",
      padding: "0px",
      margin: "0px",
      border: "0px none rgb(0, 0, 0)",
      color: "rgb(0, 0, 0)",
      backgroundColor: "rgba(0, 0, 0, 0)",
      fontSize: "16px",
      fontWeight: "400",
      lineHeight: "normal",
    },
    boxModel: {
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      border: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      content: { width: 400, height: 200 },
      position: { x: 0, y: 0 },
    },
    classList: [],
    attributes: [],
    semantic: { tagName: "div", textContentPreview: "" },
    siblingSummary: {
      count: 1,
      index: 0,
      parentTagName: "body",
      parent: { runtimeId: "parent-1", tagName: "body", selector: "body" },
    },
    parentLayout: { mode: "block", display: "block" },
    sourceConfidence: "high",
  };
}

export function makeReadyOriginState(runtimeId = "runtime-1"): SelectionOriginState {
  return {
    status: "ready",
    revision: 1,
    runtimeId,
    origins: [
      {
        relativePath: "src/components/Checkout.tsx",
        startLine: 12,
        confidence: "high",
        kind: "js",
        warnings: [],
      },
      {
        relativePath: "src/styles/checkout.css",
        startLine: 8,
        confidence: "medium",
        kind: "css",
        warnings: [],
      },
    ],
    originsTruncated: true,
  };
}

export function makeGroup(memberCount = 2): MultiSelectGroup {
  const members: MultiSelectGroup["members"] = Array.from({ length: memberCount }, (_, index) => ({
    runtimeId: `runtime-${index}`,
    tagName: "div",
    frameId: "main",
    frameKind: "top",
    shadowKind: "light-dom",
  }));
  return {
    id: createMultiSelectGroupId("grp-0001"),
    members,
    frameId: "main",
    frameKind: "top",
    shadowKind: "light-dom",
    shadowRootCompatible: true,
    commonParent: null,
    boundingRect: { x: 0, y: 0, width: 200, height: 100 },
  };
}

export function makeReparentOperation(): Operation {
  return {
    id: "op-reparent01",
    timestamp: 1_700_000_000_000,
    runtime: false,
    origin: "canvas-drag",
    confidence: 1,
    kind: "reparent-element",
    element: { runtimeId: "child-1" },
    sourceParent: { runtimeId: "source-1" },
    sourceIndex: 0,
    targetParent: { runtimeId: "target-1" },
    targetIndex: 0,
  };
}
