import { expect, test } from "@playwright/test";

import {
  appendOperation,
  type BreakpointStyleEditOperation,
  createChangeSet,
  isBaseOverwriteAllowed,
} from "@vision-control/change-ir";
import { compileContext } from "@vision-control/context-compiler";

/**
 * @breakpoint-confidence — breakpoint context + source-confidence UI contract.
 *
 * Verifies, at the unit level:
 * 1. A `breakpoint-style-edit` op at `md:` is scoped to `md` and does NOT touch
 *    base styles unless `applyToBase: true` is set.
 * 2. The context compiler derives a breakpoint context from the changeset.
 * 3. Source candidates with LOW/MEDIUM confidence remain visible in the compiled
 *    context (never hidden).
 */

const BASE_TIME = 1_700_000_000_000;

const mdStyleOp: BreakpointStyleEditOperation = {
  id: "op-bp-e2e0001",
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
  origin: "property-panel",
  confidence: 1,
};

test.describe("@breakpoint-confidence unit", () => {
  test("a breakpoint-style-edit at md: is scoped and never overwrites base without explicit intent", () => {
    expect(isBaseOverwriteAllowed(mdStyleOp)).toBe(false);

    const overwrite: BreakpointStyleEditOperation = {
      ...mdStyleOp,
      id: "op-bp-e2e0002",
      applyToBase: true,
    };
    expect(isBaseOverwriteAllowed(overwrite)).toBe(true);
  });

  test("the context compiler derives breakpoint context from a breakpoint changeset", () => {
    const changeset = appendOperation(
      createChangeSet({
        id: "cs-e2e-bp01",
        workspaceId: "ws-e2e-bp",
        sessionId: "sess-e2e-bp",
        now: BASE_TIME,
      }),
      mdStyleOp,
    );
    const ctx = compileContext({
      goal: "Edit padding at md",
      selection: {
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
      },
      changeset,
      sourceCandidates: [
        {
          workspaceRelativePath: "src/Card.tsx",
          confidence: "high",
          warnings: [],
        },
      ],
      warnings: [],
      compiledAt: BASE_TIME,
    });

    expect(ctx.breakpoint).toBeDefined();
    expect(ctx.breakpoint?.activeViewport).toBe("tablet");
    expect(ctx.breakpoint?.responsivePrefix).toBe("md");
    expect(ctx.breakpoint?.mediaQuerySource).toBe("@media (min-width: 768px)");
    expect(ctx.breakpoint?.scopedChangeCount).toBe(1);
  });

  test("compiled source candidates surface LOW/MEDIUM and never hide them", () => {
    const changeset = createChangeSet({
      id: "cs-e2e-bp02",
      workspaceId: "ws-e2e-bp",
      sessionId: "sess-e2e-bp",
      now: BASE_TIME,
    });
    const ctx = compileContext({
      goal: "Inspect confidence",
      selection: {
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
      },
      changeset,
      sourceCandidates: [
        {
          workspaceRelativePath: "src/Card.tsx",
          confidence: "high",
          warnings: ["repeated instance: 2 elements share source id"],
        },
        {
          workspaceRelativePath: "src/Card.module.css",
          confidence: "low",
          warnings: ["llm-inferred origin"],
        },
      ],
      warnings: [],
      compiledAt: BASE_TIME,
    });

    expect(ctx.source.candidates).toHaveLength(2);
    expect(ctx.source.candidates[0]?.confidence).toBe("high");
    expect(ctx.source.candidates[1]?.confidence).toBe("low");
    expect(ctx.source.candidates[1]?.warnings).toContain("llm-inferred origin");
    expect(ctx.source.bestCandidateIndex).toBe(0);
  });
});
