import type { Operation } from "@vision-control/change-ir";
import { describe, expect, it } from "vitest";
import {
  classAddOperation,
  makeCandidate,
  makeChangeSet,
  makeInputs,
  makeSelection,
  styleEditOperation,
} from "./context-test-fixtures.js";
import {
  CompiledContextSchema,
  compileContext,
  DEFAULT_TOKEN_BUDGET,
  PACKAGE_NAME,
  redactContext,
} from "./index.js";

describe("compileContext", () => {
  it("exposes the package name sentinel", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/context-compiler");
  });

  it("produces a schema-valid compiled context", () => {
    expect(CompiledContextSchema.safeParse(compileContext(makeInputs())).success).toBe(true);
  });

  it("preserves the goal as the highest-priority field", () => {
    expect(compileContext(makeInputs({ goal: "My custom goal" })).goal).toBe("My custom goal");
  });

  it("projects a JSON-safe target without live Element refs", () => {
    const context = compileContext(makeInputs());
    for (const item of context.target.breadcrumb) expect("element" in item).toBe(false);
    expect(context.target.identity.sourceId).toBe("src-btn-0001");
    expect(context.target.semantic.tagName).toBe("button");
    expect(context.target.boxModel.contentWidth).toBe(120);
  });

  it("redacts credential-bearing DOM attributes from the public context output", () => {
    const generatedCredential = String.fromCodePoint(97).repeat(8);
    const context = redactContext(
      compileContext(
        makeInputs({
          selection: makeSelection({
            tagName: "div",
            attributes: [
              { name: "session-key", value: generatedCredential },
              { name: "token-budget", value: "4096" },
            ],
          }),
        }),
      ),
    );

    expect({
      credentialLeak: JSON.stringify(context).includes(generatedCredential),
      sensitiveAttribute: context.target.attributes.find((entry) => entry.name === "session-key"),
      safeMetadata: context.target.attributes.find((entry) => entry.name === "token-budget"),
      redactionCount: context.privacyReport.redactions.filter(
        (entry) => entry.patternId === "sensitive-attribute",
      ).length,
    }).toEqual({
      credentialLeak: false,
      sensitiveAttribute: { name: "session-key", value: "[REDACTED:sensitive-attribute]" },
      safeMetadata: { name: "token-budget", value: "4096" },
      redactionCount: 1,
    });
  });

  it("summarizes operations with kind, runtime flag, and detail", () => {
    const context = compileContext(
      makeInputs({ changeset: makeChangeSet([styleEditOperation, classAddOperation]) }),
    );
    expect(context.operations).toHaveLength(2);
    const styleOperation = context.operations[0];
    expect(styleOperation?.kind).toBe("style-edit");
    if (styleOperation?.kind !== "style-edit") return;
    expect(styleOperation.runtime).toBe(false);
    expect(styleOperation.description).toContain("color");
    expect(styleOperation.detail.property).toBe("color");
  });

  it("derives verification assertions from the changeset", () => {
    const context = compileContext(makeInputs());
    expect(context.verificationPlan.assertions.length).toBeGreaterThan(0);
    expect(context.verificationPlan.notes).not.toContain("STUB");
    expect(context.verificationPlan.assertions[0]?.description).toBe("style-edit:value");
  });

  it("derives reorder assertions through createPlan", () => {
    const reorderOperation: Operation = {
      id: "op-reorder01",
      kind: "reorder-child",
      parent: { runtimeId: "runtime-parent", selector: "main" },
      child: {
        runtimeId: "runtime-0001",
        sourceId: "src-btn-0001",
        selector: "button.primary",
      },
      fromIndex: 0,
      toIndex: 2,
      timestamp: 1002,
      runtime: false,
      origin: "canvas-drag",
      confidence: 1,
    };
    const context = compileContext(makeInputs({ changeset: makeChangeSet([reorderOperation]) }));
    expect(context.verificationPlan.assertions[0]?.description).toBe("reorder-child:toIndex");
  });

  it("notes the preview-clear-before-verify invariant", () => {
    expect(compileContext(makeInputs()).verificationPlan.notes).toContain(
      "preview layer is cleared",
    );
  });

  it("marks runtime preview operations distinctly from source intent", () => {
    const runtimeOperation: Operation = {
      ...styleEditOperation,
      id: "op-runtime01",
      runtime: true,
    };
    const context = compileContext(makeInputs({ changeset: makeChangeSet([runtimeOperation]) }));
    expect(context.operations[0]?.runtime).toBe(true);
  });

  it("picks the highest-confidence source candidate", () => {
    const context = compileContext(
      makeInputs({
        sourceCandidates: [
          makeCandidate({ confidence: "low", workspaceRelativePath: "a.tsx" }),
          makeCandidate({ confidence: "high", workspaceRelativePath: "b.tsx" }),
        ],
      }),
    );
    expect(context.source.bestCandidateIndex).toBe(1);
  });

  it("uses the default token budget", () => {
    const context = compileContext(makeInputs());
    expect(context.metadata.tokenBudget).toBe(DEFAULT_TOKEN_BUDGET);
    expect(context.metadata.truncated).toBe(false);
    expect(context.metadata.operationCount).toBe(1);
  });
});

describe("compileContext optional fields", () => {
  it("emits V1 fields when supplied and omits them when absent", () => {
    const withV1 = compileContext(
      makeInputs({
        multiSelect: { groupId: "grp-1", targets: [{ selectors: ["a"] }] },
        breakpoint: { activeViewport: "tablet", responsivePrefix: "md" },
        sourceConfidenceDetail: { method: "marker", reasons: ["matched"], warnings: [] },
        suggestedDiffs: [{ diff: "-a\n+b", confidence: "high", preconditions: ["static"] }],
        layoutContext: { gridColumns: 3 },
        adapterWarnings: [{ code: "dyn", message: "dynamic class", severity: "warning" }],
      }),
    );
    expect(withV1.multiSelect?.groupId).toBe("grp-1");
    expect(withV1.breakpoint?.responsivePrefix).toBe("md");
    expect(withV1.sourceConfidenceDetail?.method).toBe("marker");
    expect(withV1.suggestedDiffs).toHaveLength(1);
    expect(withV1.layoutContext?.gridColumns).toBe(3);
    expect(withV1.adapterWarnings).toHaveLength(1);
    expect(CompiledContextSchema.safeParse(withV1).success).toBe(true);
    const withoutV1 = compileContext(makeInputs());
    expect(withoutV1.multiSelect).toBeUndefined();
    expect(withoutV1.breakpoint).toBeUndefined();
    expect(withoutV1.suggestedDiffs).toBeUndefined();
  });

  it("emits token-registry summaries when supplied", () => {
    const context = compileContext(
      makeInputs({
        tokenRegistry: {
          totalTokens: 42,
          categories: { spacing: 20, color: 22 },
          sources: ["tailwind-v3-config", "css-custom-property"],
          conflictCount: 1,
        },
      }),
    );
    expect(context.tokenRegistry?.totalTokens).toBe(42);
    expect(context.tokenRegistry?.categories.spacing).toBe(20);
    expect(CompiledContextSchema.safeParse(context).success).toBe(true);
    expect(compileContext(makeInputs()).tokenRegistry).toBeUndefined();
  });

  it("emits component-props summaries when supplied", () => {
    const context = compileContext(
      makeInputs({
        componentProps: {
          componentName: "Button",
          framework: "jsx",
          props: [
            {
              name: "variant",
              kind: "literal-string",
              editable: true,
              value: "secondary",
              candidates: ["primary", "secondary", "danger"],
            },
            { name: "disabled", kind: "literal-boolean", editable: true, value: "false" },
            { name: "onClick", kind: "identifier", editable: false },
          ],
          ownershipRisk: "high",
          warnings: [],
        },
      }),
    );
    expect(context.componentProps?.props).toHaveLength(3);
    expect(context.componentProps?.props[2]?.editable).toBe(false);
    expect(context.componentProps?.ownershipRisk).toBe("high");
    expect(CompiledContextSchema.safeParse(context).success).toBe(true);
    expect(compileContext(makeInputs()).componentProps).toBeUndefined();
  });

  it("emits screenshot metadata only when explicitly opted in", () => {
    const withScreenshot = compileContext(
      makeInputs({
        screenshotOptIn: true,
        screenshotRef: {
          artifactId: "shot-1",
          redactionReport: "r1",
          redactionSummary: { totalMasked: 2, postCaptureRecheck: "pass" },
        },
      }),
    );
    expect(withScreenshot.screenshotRef?.artifactId).toBe("shot-1");
    expect(withScreenshot.screenshotRef?.redactionSummary?.totalMasked).toBe(2);
    expect(withScreenshot.screenshotRef?.redactionSummary?.postCaptureRecheck).toBe("pass");
    expect(withScreenshot.screenshotRef && "image" in withScreenshot.screenshotRef).toBe(false);
    expect(compileContext(makeInputs()).screenshotRef).toBeUndefined();
  });

  it("drops screenshot metadata without explicit opt-in", () => {
    expect(
      compileContext(makeInputs({ screenshotRef: { artifactId: "shot-leak" } })).screenshotRef,
    ).toBeUndefined();
    expect(
      compileContext(
        makeInputs({ screenshotOptIn: false, screenshotRef: { artifactId: "shot-off" } }),
      ).screenshotRef,
    ).toBeUndefined();
  });
});
