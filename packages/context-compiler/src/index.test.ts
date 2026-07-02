import type { ChangeSet, Operation } from "@vision-control/change-ir";
import type { SelectionSummary } from "@vision-control/inspector-core";
import type { SourceCandidate } from "@vision-control/source-resolver";
import { describe, expect, it } from "vitest";

import {
  type CompileContextInputs,
  CompiledContextSchema,
  compileContext,
  DEFAULT_TOKEN_BUDGET,
  PACKAGE_NAME,
  redactContext,
  renderJson,
  renderMarkdown,
  STUB_VERIFICATION_PLAN,
  TokenBudget,
} from "./index.js";

const makeSelection = (overrides?: {
  readonly attributes?: { readonly name: string; readonly value: string }[];
  readonly textContentPreview?: string;
}): SelectionSummary => ({
  identity: {
    runtimeId: "runtime-0001",
    tagName: "button",
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
    { tagName: "button", id: "cta", className: "btn primary", selector: "button.primary" },
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
  attributes: (overrides?.attributes ?? [{ name: "type", value: "submit" }]).map((a) => ({
    name: a.name,
    value: a.value,
  })),
  semantic: {
    tagName: "button",
    role: "button",
    name: "Submit",
    textContentPreview: overrides?.textContentPreview ?? "Submit",
  },
  siblingSummary: { count: 3, index: 1, parentTagName: "main", parentLayoutRole: "flex" },
  parentLayout: { mode: "flex", display: "flex", flexDirection: "row" },
  sourceConfidence: "high",
});

const styleEditOperation: Operation = {
  id: "op-style0001",
  kind: "style-edit",
  target: { runtimeId: "runtime-0001", sourceId: "src-btn-0001", selector: "button.primary" },
  property: "color",
  value: "red",
  important: true,
  timestamp: 1000,
  runtime: false,
};

const classAddOperation: Operation = {
  id: "op-class0001",
  kind: "class-add",
  target: { runtimeId: "runtime-0001", sourceId: "src-btn-0001", selector: "button.primary" },
  className: "active",
  timestamp: 1001,
  runtime: false,
};

const makeChangeSet = (operations: readonly Operation[] = [styleEditOperation]): ChangeSet => ({
  id: "cs-00000001",
  sessionId: "sess-00001",
  operations: [...operations],
  createdAt: 1000,
  updatedAt: 1001,
  committed: false,
});

const makeCandidate = (overrides?: Partial<SourceCandidate>): SourceCandidate => ({
  workspaceRelativePath: "src/components/Button.tsx",
  componentName: "Button",
  snippet: "export function Button() {\n  return <button>Click</button>;\n}",
  startLine: 10,
  endLine: 12,
  confidence: "high",
  warnings: [],
  ...overrides,
});

const makeInputs = (overrides?: Partial<CompileContextInputs>): CompileContextInputs => ({
  goal: "Change the CTA button color to red",
  selection: makeSelection(),
  changeset: makeChangeSet(),
  sourceCandidates: [makeCandidate()],
  warnings: [
    {
      code: "low-confidence",
      message: "Source confidence is medium",
      severity: "warning" as const,
      source: "inspector",
    },
  ],
  compiledAt: 1700000000000,
  ...overrides,
});

describe("context-compiler", () => {
  it("exposes the package name sentinel", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/context-compiler");
  });

  describe("compileContext", () => {
    it("produces a schema-valid compiled context", () => {
      const context = compileContext(makeInputs());
      const result = CompiledContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    it("preserves the goal as the highest-priority field", () => {
      const context = compileContext(makeInputs({ goal: "My custom goal" }));
      expect(context.goal).toBe("My custom goal");
    });

    it("projects the selection into a JSON-safe target summary without live Element refs", () => {
      const context = compileContext(makeInputs());
      for (const item of context.target.breadcrumb) {
        expect("element" in item).toBe(false);
      }
      expect(context.target.identity.sourceId).toBe("src-btn-0001");
      expect(context.target.semantic.tagName).toBe("button");
      expect(context.target.boxModel.contentWidth).toBe(120);
    });

    it("summarizes operations with kind, runtime flag, and description", () => {
      const context = compileContext(
        makeInputs({ changeset: makeChangeSet([styleEditOperation, classAddOperation]) }),
      );
      expect(context.operations).toHaveLength(2);
      const styleOp = context.operations[0];
      expect(styleOp?.kind).toBe("style-edit");
      expect(styleOp?.runtime).toBe(false);
      expect(styleOp?.description).toContain("color");
      expect(styleOp?.detail.property).toBe("color");
    });

    it("includes a verification plan stub with empty assertions", () => {
      const context = compileContext(makeInputs());
      expect(context.verificationPlan.assertions).toEqual([]);
      expect(context.verificationPlan.notes).toBe(STUB_VERIFICATION_PLAN.notes);
    });

    it("marks runtime preview operations distinctly from source intent", () => {
      const runtimeOp: Operation = { ...styleEditOperation, id: "op-runtime01", runtime: true };
      const context = compileContext(makeInputs({ changeset: makeChangeSet([runtimeOp]) }));
      expect(context.operations[0]?.runtime).toBe(true);
    });

    it("picks the best (highest-confidence) source candidate", () => {
      const lowCandidate = makeCandidate({ confidence: "low", workspaceRelativePath: "a.tsx" });
      const highCandidate = makeCandidate({ confidence: "high", workspaceRelativePath: "b.tsx" });
      const context = compileContext(
        makeInputs({ sourceCandidates: [lowCandidate, highCandidate] }),
      );
      expect(context.source.bestCandidateIndex).toBe(1);
    });

    it("uses the default token budget when none is specified", () => {
      const context = compileContext(makeInputs());
      expect(context.metadata.tokenBudget).toBe(DEFAULT_TOKEN_BUDGET);
      expect(context.metadata.truncated).toBe(false);
      expect(context.metadata.operationCount).toBe(1);
    });
  });

  describe("renderJson", () => {
    it("renders schema-valid JSON that round-trips through the schema", () => {
      const context = redactContext(compileContext(makeInputs()));
      const json = renderJson(context);
      const parsed = JSON.parse(json);
      const result = CompiledContextSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    });

    it("includes source snippets in the JSON output", () => {
      const snippet = "export function Button() {\n  return <button>Click</button>;\n}";
      const context = redactContext(
        compileContext(makeInputs({ sourceCandidates: [makeCandidate({ snippet })] })),
      );
      expect(renderJson(context)).toContain("return <button>Click</button>");
    });
  });

  describe("renderMarkdown", () => {
    it("renders the goal and major section headers", () => {
      const markdown = renderMarkdown(redactContext(compileContext(makeInputs())));
      expect(markdown).toContain("# Agent Context");
      expect(markdown).toContain("Change the CTA button color to red");
      expect(markdown).toContain("## Selected Target");
      expect(markdown).toContain("## Operations");
      expect(markdown).toContain("## Source");
      expect(markdown).toContain("## Verification Plan");
      expect(markdown).toContain("## Privacy Report");
    });

    it("renders source snippets in fenced code blocks", () => {
      const snippet = "const x = 42;";
      const markdown = renderMarkdown(
        redactContext(
          compileContext(makeInputs({ sourceCandidates: [makeCandidate({ snippet })] })),
        ),
      );
      expect(markdown).toContain("```tsx");
      expect(markdown).toContain("const x = 42;");
    });

    it("renders operations as a markdown table", () => {
      const markdown = renderMarkdown(redactContext(compileContext(makeInputs())));
      expect(markdown).toContain("| Kind | Runtime | Description | Target |");
      expect(markdown).toContain("style-edit");
      expect(markdown).toContain("source");
    });
  });

  describe("TokenBudget truncation order", () => {
    it("truncates low-priority sections before high-priority ones", () => {
      const hugeSnippet = "x".repeat(6000);
      const inputs = makeInputs({
        sourceCandidates: [makeCandidate({ snippet: hugeSnippet })],
        warnings: [{ code: "stale", message: "registry is stale", severity: "warning" as const }],
        tokenBudget: 80,
      });
      const context = compileContext(inputs);

      expect(context.metadata.truncated).toBe(true);
      // Goal is highest priority — never truncated.
      expect(context.goal).toBe(inputs.goal);
      // Warnings are lower priority than source/operations/target — cleared first.
      expect(context.warnings).toHaveLength(0);
      expect(context.metadata.truncatedSections).toContain("warnings");
    });

    it("orders truncatedSections lowest-priority first", () => {
      const context = compileContext(
        makeInputs({
          sourceCandidates: [makeCandidate({ snippet: "y".repeat(8000) })],
          tokenBudget: 60,
        }),
      );
      const priority = [
        "privacyReport",
        "warnings",
        "verificationPlan",
        "layout",
        "source",
        "operations",
        "target",
      ];
      const present = context.metadata.truncatedSections;
      const ranks = present.map((section) => priority.indexOf(section));
      const sorted = [...ranks].sort((a, b) => a - b);
      expect(ranks).toEqual(sorted);
    });

    it("does not truncate when the context fits the budget", () => {
      const context = compileContext(makeInputs({ tokenBudget: DEFAULT_TOKEN_BUDGET }));
      expect(context.metadata.truncated).toBe(false);
      expect(context.metadata.truncatedSections).toEqual([]);
    });

    it("TokenBudget.estimate scales with content size", () => {
      const budget = new TokenBudget(1000);
      const small = budget.estimate({ a: 1 });
      const large = budget.estimate({ a: "x".repeat(4000) });
      expect(large).toBeGreaterThan(small);
      expect(large).toBeGreaterThan(900);
    });
  });

  describe("redaction", () => {
    it("produces a privacy report when secrets are present", () => {
      const inputs = makeInputs({
        selection: makeSelection({
          attributes: [
            { name: "data-config", value: "password=VC_SECRET_SHOULD_NOT_EXPORT" },
            { name: "data-key", value: "api_key=sk_test_12345" },
          ],
        }),
      });
      const context = redactContext(compileContext(inputs));
      expect(context.privacyReport.totalRedacted).toBeGreaterThan(0);
    });

    it("excludes seeded secrets from JSON output", () => {
      const inputs = makeInputs({
        selection: makeSelection({
          attributes: [
            { name: "data-config", value: "password=VC_SECRET_SHOULD_NOT_EXPORT" },
            { name: "data-key", value: "api_key=sk_test_12345" },
          ],
        }),
      });
      const json = renderJson(redactContext(compileContext(inputs)));
      expect(json).not.toContain("VC_SECRET_SHOULD_NOT_EXPORT");
      expect(json).not.toContain("sk_test_12345");
    });

    it("excludes seeded secrets from Markdown output", () => {
      const inputs = makeInputs({
        selection: makeSelection({
          attributes: [
            { name: "data-config", value: "password=VC_SECRET_SHOULD_NOT_EXPORT" },
            { name: "data-key", value: "api_key=sk_test_12345" },
          ],
        }),
      });
      const markdown = renderMarkdown(redactContext(compileContext(inputs)));
      expect(markdown).not.toContain("VC_SECRET_SHOULD_NOT_EXPORT");
      expect(markdown).not.toContain("sk_test_12345");
    });

    it("redacts secrets embedded in source snippets", () => {
      const inputs = makeInputs({
        sourceCandidates: [
          makeCandidate({ snippet: "const token = 'password=VC_SECRET_SHOULD_NOT_EXPORT';" }),
        ],
      });
      const json = renderJson(redactContext(compileContext(inputs)));
      expect(json).not.toContain("VC_SECRET_SHOULD_NOT_EXPORT");
    });

    it("does not mutate the original context", () => {
      const inputs = makeInputs({
        selection: makeSelection({
          attributes: [{ name: "data-config", value: "password=VC_SECRET_SHOULD_NOT_EXPORT" }],
        }),
      });
      const original = compileContext(inputs);
      const originalJson = renderJson(original);
      redactContext(original);
      expect(renderJson(original)).toBe(originalJson);
    });

    it("leaves a clean context with zero redactions unchanged", () => {
      const context = compileContext(makeInputs());
      const redacted = redactContext(context);
      expect(redacted.privacyReport.totalRedacted).toBe(0);
    });
  });

  describe("screenshot exclusion", () => {
    it("does not include any screenshot or image artifact in the schema", () => {
      const schemaKeys = Object.keys(CompiledContextSchema.shape);
      const forbidden = schemaKeys.filter((key) =>
        /screenshot|image|picture|snapshot-data/i.test(key),
      );
      expect(forbidden).toEqual([]);
    });
  });
});
