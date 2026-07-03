import type { ChangeSet, Operation } from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";
import type { SourceCandidate } from "@vision-control/source-resolver";
import { describe, expect, it } from "vitest";

import { type CompileContextInputs, CompiledContextSchema, compileContext } from "./index.js";

const BASE_TIME = 1_700_000_000_000;

const makeSelection = (): SelectionSummary => ({
  identity: {
    runtimeId: "rt-1",
    tagName: "div",
    sourceId: "src-1",
    selector: ".card",
    frameId: "main",
    fingerprint: "abcd",
    confidence: "high",
  },
  breadcrumb: [{ tagName: "div", selector: ".card" }],
  computedStyle: {
    display: "block",
    position: "static",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexBasis: "auto",
    flexGrow: "0",
    width: "100px",
    height: "50px",
    padding: "8px",
    margin: "0",
    border: "0",
    color: "black",
    backgroundColor: "white",
    fontSize: "14px",
    fontWeight: "400",
    lineHeight: "1.5",
  },
  boxModel: {
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    border: { top: 0, right: 0, bottom: 0, left: 0 },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    content: { width: 100, height: 50 },
    position: { x: 0, y: 0 },
  },
  classList: [],
  attributes: [],
  semantic: { tagName: "div", textContentPreview: "Card" },
  siblingSummary: { count: 1, index: 0, parentTagName: "main", parentLayoutRole: "block" },
  parentLayout: { mode: "block", display: "block" },
  sourceConfidence: "high",
});

const breakpointStyleOp: Operation = {
  id: "op-bp-derive1",
  kind: "breakpoint-style-edit",
  target: { runtimeId: "rt-1", sourceId: "src-1", selector: ".card" },
  breakpoint: "md",
  activeViewport: "tablet",
  responsivePrefix: "md",
  mediaSource: "@media (min-width: 768px)",
  property: "padding",
  value: "16px",
  important: false,
  previousValue: "8px",
  timestamp: BASE_TIME,
  runtime: false,
};

const breakpointClassOp: Operation = {
  id: "op-bp-derive2",
  kind: "breakpoint-class-edit",
  target: { runtimeId: "rt-1", sourceId: "src-1", selector: ".card" },
  breakpoint: "md",
  responsivePrefix: "md",
  oldClassName: "p-2",
  newClassName: "p-4",
  timestamp: BASE_TIME + 1,
  runtime: false,
};

const styleOp: Operation = {
  id: "op-plain-style",
  kind: "style-edit",
  target: { runtimeId: "rt-1", sourceId: "src-1", selector: ".card" },
  property: "color",
  value: "red",
  important: false,
  timestamp: BASE_TIME + 2,
  runtime: false,
};

const v2Defaults = {
  schemaVersion: "2.0.0" as const,
  workspaceId: "ws-bpctx-001",
  page: { url: "https://localhost/page", title: null },
  viewport: { width: 1280, height: 720 },
  selectedTargets: [],
  sourceResolutions: [],
  verificationPlan: { assertions: [], notes: "test plan" },
  privacyReport: { redactions: [], totalRedacted: 0 },
};

const makeChangeSet = (operations: readonly Operation[]): ChangeSet => ({
  ...v2Defaults,
  id: "cs-bpctx-0001",
  sessionId: "sess-bpctx",
  operations: [...operations],
  createdAt: BASE_TIME,
  updatedAt: BASE_TIME + 1,
  committed: false,
});

const candidate: SourceCandidate = {
  workspaceRelativePath: "src/Card.tsx",
  confidence: "high",
  warnings: [],
};

const makeInputs = (overrides?: Partial<CompileContextInputs>): CompileContextInputs => ({
  goal: "Edit padding at md breakpoint",
  selection: makeSelection(),
  changeset: makeChangeSet([breakpointStyleOp]),
  sourceCandidates: [candidate],
  warnings: [],
  compiledAt: BASE_TIME,
  ...overrides,
});

describe("context-compiler breakpoint context derivation (VC-V1V2-10)", () => {
  it("derives a breakpoint context from a changeset with a breakpoint op (no explicit input)", () => {
    const ctx = compileContext(makeInputs());
    expect(ctx.breakpoint).toBeDefined();
    expect(ctx.breakpoint?.activeViewport).toBe("tablet");
    expect(ctx.breakpoint?.responsivePrefix).toBe("md");
    expect(ctx.breakpoint?.mediaQuerySource).toBe("@media (min-width: 768px)");
    expect(ctx.breakpoint?.scopedChangeCount).toBe(1);
    expect(CompiledContextSchema.safeParse(ctx).success).toBe(true);
  });

  it("counts every breakpoint-kind op in scopedChangeCount", () => {
    const ctx = compileContext(
      makeInputs({ changeset: makeChangeSet([breakpointStyleOp, breakpointClassOp, styleOp]) }),
    );
    expect(ctx.breakpoint?.scopedChangeCount).toBe(2);
  });

  it("respects an explicit breakpoint input over derivation", () => {
    const ctx = compileContext(
      makeInputs({
        breakpoint: { activeViewport: "desktop", responsivePrefix: "lg" },
      }),
    );
    expect(ctx.breakpoint?.activeViewport).toBe("desktop");
    expect(ctx.breakpoint?.responsivePrefix).toBe("lg");
    // explicit input still enriched with the scoped change count from the changeset
    expect(ctx.breakpoint?.scopedChangeCount).toBe(1);
  });

  it("omits breakpoint context when there are no breakpoint ops and no explicit input", () => {
    const ctx = compileContext(makeInputs({ changeset: makeChangeSet([styleOp]) }));
    expect(ctx.breakpoint).toBeUndefined();
  });

  it("derived context leaves applyToBase scoped (no base overwrite signal) by default", () => {
    const ctx = compileContext(makeInputs({ changeset: makeChangeSet([breakpointStyleOp]) }));
    // The breakpoint op has no applyToBase field; the context must not imply a
    // base overwrite. The presence of breakpoint context signals scoped edits.
    expect(ctx.breakpoint).toBeDefined();
    const bpOp = ctx.operations.find((o) => o.kind === "breakpoint-style-edit");
    expect(bpOp?.detail.breakpoint).toBe("md");
  });

  it("emits derived context even when the breakpoint op omits activeViewport", () => {
    const minimalBpOp: Operation = {
      id: "op-bp-minimal1",
      kind: "breakpoint-text-edit",
      target: { runtimeId: "rt-1" },
      breakpoint: "sm",
      newText: "Small",
      timestamp: BASE_TIME,
      runtime: false,
    };
    const ctx = compileContext(makeInputs({ changeset: makeChangeSet([minimalBpOp]) }));
    expect(ctx.breakpoint).toBeDefined();
    expect(ctx.breakpoint?.activeViewport).toBe("sm");
    expect(ctx.breakpoint?.responsivePrefix).toBe("sm");
    expect(ctx.breakpoint?.scopedChangeCount).toBe(1);
  });
});
