import { describe, expect, it } from "vitest";
import { makeCandidate, makeInputs, makeSelection } from "./context-test-fixtures.js";
import {
  CompiledContextSchema,
  compileContext,
  redactContext,
  renderJson,
  renderMarkdown,
} from "./index.js";

describe("context JSON formatting", () => {
  it("round-trips schema-valid JSON", () => {
    const parsed = JSON.parse(renderJson(redactContext(compileContext(makeInputs()))));
    expect(CompiledContextSchema.safeParse(parsed).success).toBe(true);
  });

  it("includes source snippets", () => {
    const snippet = "export function Button() {\n  return <button>Click</button>;\n}";
    const context = redactContext(
      compileContext(makeInputs({ sourceCandidates: [makeCandidate({ snippet })] })),
    );
    expect(renderJson(context)).toContain("return <button>Click</button>");
  });
});

describe("context Markdown formatting", () => {
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
    const markdown = renderMarkdown(
      redactContext(
        compileContext(
          makeInputs({ sourceCandidates: [makeCandidate({ snippet: "const x = 42;" })] }),
        ),
      ),
    );
    expect(markdown).toContain("```tsx");
    expect(markdown).toContain("const x = 42;");
  });

  it("renders operations as a table", () => {
    const markdown = renderMarkdown(redactContext(compileContext(makeInputs())));
    expect(markdown).toContain("| Kind | Runtime | Description | Target |");
    expect(markdown).toContain("style-edit");
    expect(markdown).toContain("source");
  });

  it("renders multi-select, breakpoint, and confidence-detail sections", () => {
    const markdown = renderMarkdown(
      redactContext(
        compileContext(
          makeInputs({
            multiSelect: {
              groupId: "grp-v1-test-0001",
              targets: [
                { runtimeId: "rt-a", sourceId: "src-a", selectors: [".a"] },
                { runtimeId: "rt-b", selectors: [".b"] },
              ],
            },
            breakpoint: {
              activeViewport: "tablet",
              responsivePrefix: "md",
              scopedChangeCount: 2,
            },
            sourceConfidenceDetail: {
              method: "marker",
              reasons: ["source marker resolved"],
              warnings: [],
            },
          }),
        ),
      ),
    );
    expect(markdown).toContain("## Multi-Select Group");
    expect(markdown).toContain("grp-v1-test-0001");
    expect(markdown).toContain("## Breakpoint Context");
    expect(markdown).toContain("tablet");
    expect(markdown).toContain("## Source Confidence Detail");
    expect(markdown).toContain("marker");
  });

  it("renders suggested diffs as inert data", () => {
    const markdown = renderMarkdown(
      redactContext(
        compileContext(
          makeInputs({
            suggestedDiffs: [
              {
                diff: "-px-3\n+px-4",
                confidence: "high",
                preconditions: ["verify after HMR"],
                kind: "tailwind-token-replace",
                sourceRanges: [{ startLine: 10, startColumn: 0, endLine: 10, endColumn: 4 }],
              },
            ],
          }),
        ),
      ),
    );
    expect(markdown).toContain("## Suggested Diffs");
    expect(markdown).toContain("tailwind-token-replace");
    expect(markdown).toContain("```diff");
    expect(markdown).toContain("-px-3");
  });

  it("renders screenshot metadata without image data", () => {
    const markdown = renderMarkdown(
      redactContext(
        compileContext(
          makeInputs({
            screenshotOptIn: true,
            screenshotRef: {
              artifactId: "shot-art-0001",
              redactionSummary: { totalMasked: 3, postCaptureRecheck: "pass" },
            },
          }),
        ),
      ),
    );
    expect(markdown).toContain("## Screenshot Reference");
    expect(markdown).toContain("shot-art-0001");
    expect(markdown).toContain("3 masked");
  });

  it("renders layout, adapter, token, and component-prop sections", () => {
    const markdown = renderMarkdown(
      redactContext(
        compileContext(
          makeInputs({
            layoutContext: { gridColumns: 12, autoLayout: "fill" },
            adapterWarnings: [
              { code: "tailwind-dynamic", message: "dynamic class detected", severity: "warning" },
            ],
            tokenRegistry: {
              totalTokens: 42,
              categories: { spacing: 20, color: 22 },
              sources: ["tailwind", "css"],
              conflictCount: 1,
            },
            componentProps: {
              componentName: "Button",
              framework: "react",
              props: [
                { name: "variant", kind: "literal-string", editable: true, value: "primary" },
              ],
              ownershipRisk: "low",
              warnings: [],
            },
          }),
        ),
      ),
    );
    expect(markdown).toContain("## Layout Context");
    expect(markdown).toContain("Grid columns:** 12");
    expect(markdown).toContain("## Adapter Warnings");
    expect(markdown).toContain("dynamic class detected");
    expect(markdown).toContain("## Token Registry");
    expect(markdown).toContain("42");
    expect(markdown).toContain("## Component Props");
    expect(markdown).toContain("variant");
  });
});

describe("context string redaction", () => {
  const secretInputs = () =>
    makeInputs({
      selection: makeSelection({
        attributes: [
          { name: "data-config", value: "password=VC_SECRET_SHOULD_NOT_EXPORT" },
          { name: "data-key", value: "api_key=sk_test_12345" },
        ],
      }),
    });

  it("reports secrets", () => {
    const context = redactContext(compileContext(secretInputs()));
    expect(context.privacyReport.totalRedacted).toBeGreaterThan(0);
  });

  it("removes secrets from JSON", () => {
    const context = redactContext(compileContext(secretInputs()));
    expect(renderJson(context)).not.toContain("VC_SECRET_SHOULD_NOT_EXPORT");
    expect(renderJson(context)).not.toContain("sk_test_12345");
  });

  it("removes secrets from Markdown", () => {
    const context = redactContext(compileContext(secretInputs()));
    expect(renderMarkdown(context)).not.toContain("VC_SECRET_SHOULD_NOT_EXPORT");
    expect(renderMarkdown(context)).not.toContain("sk_test_12345");
  });

  it("redacts secrets embedded in source snippets", () => {
    const context = redactContext(
      compileContext(
        makeInputs({
          sourceCandidates: [
            makeCandidate({ snippet: "const token = 'password=VC_SECRET_SHOULD_NOT_EXPORT';" }),
          ],
        }),
      ),
    );
    expect(renderJson(context)).not.toContain("VC_SECRET_SHOULD_NOT_EXPORT");
  });

  it("does not mutate the original context", () => {
    const original = compileContext(
      makeInputs({
        selection: makeSelection({
          attributes: [{ name: "data-config", value: "password=VC_SECRET_SHOULD_NOT_EXPORT" }],
        }),
      }),
    );
    const originalJson = renderJson(original);
    redactContext(original);
    expect(renderJson(original)).toBe(originalJson);
  });

  it("leaves a clean context with zero redactions", () => {
    expect(redactContext(compileContext(makeInputs())).privacyReport.totalRedacted).toBe(0);
  });
});
