import type { ChangeSet, Operation } from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";

import type { CompileContextInputs } from "./compiler.js";
import type { SourceCandidateSummary } from "./context-schema.js";

export const makeSelection = (overrides?: {
  readonly attributes?: { readonly name: string; readonly value: string }[];
  readonly textContentPreview?: string;
  readonly tagName?: string;
}): SelectionSummary => ({
  identity: {
    runtimeId: "runtime-0001",
    tagName: overrides?.tagName ?? "button",
    sourceId: "src-btn-0001",
    selector: "button.primary",
    frameId: "main",
    fingerprint: "abcdef12",
    confidence: "high",
  },
  breadcrumb: [
    { tagName: "html" },
    { tagName: "body" },
    { tagName: "main", selector: "main" },
    {
      tagName: overrides?.tagName ?? "button",
      id: "cta",
      className: "btn primary",
      selector: "button.primary",
    },
  ],
  computedStyle: {
    display: "inline-block",
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexBasis: "auto",
    flexGrow: "0",
    width: "120px",
    height: "40px",
    padding: "8px 16px",
    margin: "0",
    border: "1px solid #ccc",
    color: "white",
    backgroundColor: "blue",
    fontSize: "14px",
    fontWeight: "600",
    lineHeight: "1.5",
  },
  boxModel: {
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    border: { top: 1, right: 1, bottom: 1, left: 1 },
    padding: { top: 8, right: 16, bottom: 8, left: 16 },
    content: { width: 120, height: 40 },
    position: { x: 100, y: 200 },
  },
  classList: [
    { name: "btn", source: "css" },
    { name: "primary", source: "unknown" },
  ],
  attributes: (overrides?.attributes ?? [{ name: "type", value: "submit" }]).map((attribute) => ({
    name: attribute.name,
    value: attribute.value,
  })),
  semantic: {
    tagName: overrides?.tagName ?? "button",
    role: "button",
    name: "Submit",
    textContentPreview: overrides?.textContentPreview ?? "Submit",
  },
  siblingSummary: { count: 3, index: 1, parentTagName: "main", parentLayoutRole: "flex" },
  parentLayout: { mode: "flex", display: "flex", flexDirection: "row" },
  sourceConfidence: "high",
});

export const styleEditOperation: Operation = {
  id: "op-style0001",
  kind: "style-edit",
  target: { runtimeId: "runtime-0001", sourceId: "src-btn-0001", selector: "button.primary" },
  property: "color",
  value: "red",
  important: true,
  timestamp: 1000,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
};

export const classAddOperation: Operation = {
  id: "op-class0001",
  kind: "class-add",
  target: { runtimeId: "runtime-0001", sourceId: "src-btn-0001", selector: "button.primary" },
  className: "active",
  timestamp: 1001,
  runtime: false,
  origin: "property-panel",
  confidence: 1,
};

const changeSetDefaults = {
  schemaVersion: "2.0.0" as const,
  workspaceId: "ws-ctx-test-001",
  page: { url: "https://localhost/page", title: null },
  viewport: { width: 1280, height: 720 },
  selectedTargets: [],
  sourceResolutions: [],
  verificationPlan: { assertions: [], notes: "test plan" },
  privacyReport: { redactions: [], totalRedacted: 0 },
};

export const makeChangeSet = (
  operations: readonly Operation[] = [styleEditOperation],
): ChangeSet => ({
  ...changeSetDefaults,
  id: "cs-00000001",
  sessionId: "sess-00001",
  operations: [...operations],
  createdAt: 1000,
  updatedAt: 1001,
  committed: false,
});

export const makeCandidate = (
  overrides?: Partial<SourceCandidateSummary>,
): SourceCandidateSummary => ({
  workspaceRelativePath: "src/components/Button.tsx",
  componentName: "Button",
  snippet: "export function Button() {\n  return <button>Click</button>;\n}",
  startLine: 10,
  endLine: 12,
  confidence: "high",
  warnings: [],
  ...overrides,
});

export const makeInputs = (overrides?: Partial<CompileContextInputs>): CompileContextInputs => ({
  goal: "Change the CTA button color to red",
  selection: makeSelection(),
  changeset: makeChangeSet(),
  sourceCandidates: [makeCandidate()],
  warnings: [
    {
      code: "low-confidence",
      message: "Source confidence is medium",
      severity: "warning",
      source: "inspector",
    },
  ],
  compiledAt: 1_700_000_000_000,
  ...overrides,
});
