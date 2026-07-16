import type { SelectionSummary } from "@vision-control/inspector-core";

export function createSelectionSummaryFixture(runtimeId = "runtime-1"): SelectionSummary {
  return {
    identity: {
      runtimeId,
      tagName: "button",
      sourceId: "src-button-1",
      frameId: "main",
      fingerprint: "abc12345",
      confidence: "high",
      selector: "#submit",
    },
    breadcrumb: [
      { tagName: "body", selector: "body" },
      { tagName: "button", selector: "#submit" },
    ],
    computedStyle: {
      display: "inline-flex",
      position: "static",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexBasis: "auto",
      flexGrow: "0",
      width: "120px",
      height: "40px",
      padding: "8px",
      margin: "0px",
      border: "1px solid rgb(0, 0, 0)",
      color: "rgb(0, 0, 0)",
      backgroundColor: "rgb(255, 255, 255)",
      fontSize: "16px",
      fontWeight: "600",
      lineHeight: "20px",
    },
    boxModel: {
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      border: { top: 1, right: 1, bottom: 1, left: 1 },
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      content: { width: 120, height: 40 },
      position: { x: 12, y: 24 },
    },
    classList: [{ name: "primary", source: "css" }],
    attributes: [{ name: "type", value: "submit" }],
    semantic: {
      tagName: "button",
      role: "button",
      name: "Submit",
      textContentPreview: "Submit",
    },
    siblingSummary: { count: 3, index: 1, parentTagName: "form" },
    parentLayout: { mode: "block", display: "block" },
    sourceConfidence: "high",
    activeBreakpoint: "md",
  };
}
