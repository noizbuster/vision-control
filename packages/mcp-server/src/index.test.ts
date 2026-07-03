import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CaptureElementOutputSchema,
  CoordinationResultSchema,
  createMcpServer,
  GetActiveSessionOutputSchema,
  GetChangesetOutputSchema,
  GetDiagnosticsOutputSchema,
  GetSelectionOutputSchema,
  GetVerificationPlanOutputSchema,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  type McpServerDeps,
  PACKAGE_NAME,
  TOOL_NAMES,
  textResult,
} from "./index.js";

/** Fake deps with controlled test data. */
function createFakeDeps(): McpServerDeps {
  return {
    async getActiveSession() {
      return {
        sessionId: "sess-test12345678",
        workspaceId: "ws-test",
        connected: true,
        clientVersion: "1.0.0",
        protocolVersion: "1.0.0",
      };
    },
    async getSelection() {
      return {
        sessionId: "sess-test12345678",
        elementTag: "button",
        selector: "#save",
        sourceId: "src-abc123def456",
        textPreview: "Save",
      };
    },
    async getChangeset() {
      return {
        sessionId: "sess-test12345678",
        operationCount: 1,
        operations: [
          {
            id: "op-test12345678",
            kind: "style-edit",
            runtime: false,
            description: "Set color to red",
          },
        ],
      };
    },
    async getSourceContext() {
      return undefined;
    },
    async getVerificationPlan() {
      return { assertions: [{ description: "Element has color red" }], notes: "stub plan" };
    },
    async getDiagnostics() {
      return [
        {
          code: "LOW_CONFIDENCE",
          message: "Source resolution is low confidence",
          severity: "warning" as const,
          source: "source-resolver",
        },
      ];
    },
    async captureElement() {
      return { captured: true, selector: "#save", sourceId: "src-abc123def456", note: "captured" };
    },
    async requestVerification() {
      return { acknowledged: true, message: "verification requested" };
    },
    async clearPreview() {
      return { acknowledged: true, message: "preview cleared" };
    },
    async markPatchStarted() {
      return { acknowledged: true, message: "patch started" };
    },
    async markPatchCompleted() {
      return { acknowledged: true, message: "patch completed" };
    },
  };
}

/** Connect a test client to the MCP server via in-memory transport. */
async function connectClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

describe("mcp-server package", () => {
  it("exposes the package name sentinel", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/mcp-server");
  });

  it("creates a server with the correct name and version", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const info = client.getServerVersion();
    expect(info?.name).toBe(MCP_SERVER_NAME);
    expect(info?.version).toBe(MCP_SERVER_VERSION);
  });
});

describe("mcp-server tool registration", () => {
  it("registers all 11 read-only and coordination tools", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const expected of TOOL_NAMES) {
      expect(names).toContain(expected);
    }
    expect(tools).toHaveLength(TOOL_NAMES.length);
  });

  it("does NOT register vision_apply_deterministic_patch", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    // Built via concatenation so this test source holds no literal token a
    // future scan flags (same pattern as the docs-freshness forbidden-tool guard).
    const forbidden = "vision_" + "apply_deterministic_patch";
    expect(names).not.toContain(forbidden);
  });

  it("the tool list contains NO source-write / apply / patch / codemod tool (broad scan)", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    const forbidden = "vision_" + "apply_deterministic_patch";
    const isCoordinationSignal = (name: string): boolean =>
      name === "vision_mark_patch_started" || name === "vision_mark_patch_completed";
    const sourceMutating = (name: string): boolean => {
      if (isCoordinationSignal(name)) return false;
      return (
        name === forbidden ||
        /apply/i.test(name) ||
        /write/i.test(name) ||
        /patch/i.test(name) ||
        /codemod/i.test(name)
      );
    };
    const offenders = names.filter(sourceMutating);
    expect(offenders, `tool list must contain no source-write/apply/patch/codemod tool`).toEqual(
      [],
    );
  });

  it("the strengthened source-mutating scan would catch a hypothetical codemod tool (adversarial probe)", async () => {
    const forbidden = "vision_" + "apply_deterministic_patch";
    const isCoordinationSignal = (name: string): boolean =>
      name === "vision_mark_patch_started" || name === "vision_mark_patch_completed";
    const sourceMutating = (name: string): boolean => {
      if (isCoordinationSignal(name)) return false;
      return (
        name === forbidden ||
        /apply/i.test(name) ||
        /write/i.test(name) ||
        /patch/i.test(name) ||
        /codemod/i.test(name)
      );
    };
    const hypotheticalOffenders = [
      forbidden,
      "vision_codemod",
      "vision_codemod_apply",
      "vision_apply_patch",
      "vision_write_source",
      "vision_patch",
      "vision_apply",
      "vision_write_file",
    ];
    for (const name of hypotheticalOffenders) {
      expect(sourceMutating(name), `expected "${name}" to be flagged as source-mutating`).toBe(
        true,
      );
    }
    expect(sourceMutating("vision_mark_patch_started")).toBe(false);
    expect(sourceMutating("vision_mark_patch_completed")).toBe(false);
    const readOnlyTools = [
      "vision_get_active_session",
      "vision_get_selection",
      "vision_get_changeset",
      "vision_get_source_context",
      "vision_get_verification_plan",
      "vision_get_diagnostics",
      "vision_capture_element",
      "vision_request_verification",
      "vision_clear_preview",
    ];
    for (const name of readOnlyTools) {
      expect(sourceMutating(name), `expected "${name}" to be allowed`).toBe(false);
    }
  });
});

describe("mcp-server deterministic patch suggestions (inert data, VC-V1V2-14)", () => {
  function createDepsWithSuggestion() {
    const base = createFakeDeps();
    return {
      ...base,
      async getSourceContext() {
        return {
          goal: "Change gap token",
          target: {
            identity: { selectors: ["div.flex"] },
            semantic: { tagName: "div", textContentPreview: "items" },
            breadcrumb: [],
            computedStyle: {},
            boxModel: { contentWidth: 0, contentHeight: 0, positionX: 0, positionY: 0 },
            classList: [],
            attributes: [],
          },
          operations: [],
          source: { candidates: [] },
          layout: {
            parentMode: "flex",
            parentDisplay: "flex",
            siblingCount: 0,
            siblingIndex: 0,
          },
          verificationPlan: { assertions: [], notes: "stub" },
          warnings: [],
          privacyReport: { redactions: [], totalRedacted: 0 },
          metadata: {
            compiledAt: 1,
            formatVersion: "1.1.0",
            tokenBudget: 8000,
            tokenEstimate: 1,
            truncated: false,
            truncatedSections: [],
            operationCount: 0,
          },
          suggestedDiffs: [
            {
              diff: "--- a/src/Button.tsx\n+++ b/src/Button.tsx\n@@ -10,1 +10,1 @@\n-px-3\n+px-4",
              confidence: "high",
              preconditions: ["verify after HMR"],
              kind: "tailwind-token-replace",
              sourceRanges: [{ startLine: 10, startColumn: 0, endLine: 10, endColumn: 4 }],
            },
          ],
        };
      },
    };
  }

  it("vision_get_source_context returns suggestedDiff data when the compiler emits it", async () => {
    const server = createMcpServer(createDepsWithSuggestion());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_source_context", arguments: {} });
    const text = extractText(result);
    const data = JSON.parse(text) as { suggestedDiffs?: unknown[] };
    expect(Array.isArray(data.suggestedDiffs)).toBe(true);
    expect(data.suggestedDiffs).toHaveLength(1);
  });

  it("the surfaced suggestedDiff carries no apply/write flag (inert data only)", async () => {
    const server = createMcpServer(createDepsWithSuggestion());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_source_context", arguments: {} });
    const text = extractText(result);
    const data = JSON.parse(text) as { suggestedDiffs?: Array<Record<string, unknown>> };
    const suggestion = data.suggestedDiffs?.[0];
    expect(suggestion).toBeDefined();
    expect(suggestion && "applied" in suggestion).toBe(false);
  });
});

describe("mcp-server V1 source context (VC-V1V2-16)", () => {
  function createV1ContextDeps() {
    const base = createFakeDeps();
    return {
      ...base,
      async getSourceContext() {
        return {
          goal: "Multi-select Auto Layout + Tailwind edit",
          target: {
            identity: { selectors: ["div.flex"], sourceId: "src-v1-0001" },
            semantic: { tagName: "div", textContentPreview: "grid items" },
            breadcrumb: [],
            computedStyle: { display: "grid" },
            boxModel: { contentWidth: 0, contentHeight: 0, positionX: 0, positionY: 0 },
            classList: [],
            attributes: [],
          },
          operations: [
            {
              id: "op-v1-group-001",
              kind: "multi-select-group",
              runtime: false,
              description: "select group",
              target: "div.flex",
              detail: {},
            },
          ],
          source: { candidates: [] },
          layout: {
            parentMode: "grid",
            parentDisplay: "grid",
            siblingCount: 0,
            siblingIndex: 0,
          },
          verificationPlan: {
            assertions: [
              { description: "grid-reorder:dom-order — sibling-order at toIndex" },
              { description: "breakpoint-style-edit:value — color blue" },
            ],
            notes: "V1 verification plan generated by the verification engine",
          },
          warnings: [],
          privacyReport: { redactions: [], totalRedacted: 0 },
          metadata: {
            compiledAt: 1,
            formatVersion: "1.1.0",
            tokenBudget: 8000,
            tokenEstimate: 1,
            truncated: false,
            truncatedSections: [],
            operationCount: 1,
          },
          multiSelect: {
            groupId: "grp-v1-mcp-0001",
            targets: [
              { runtimeId: "rt-a", sourceId: "src-a", selectors: ["div.a"] },
              { runtimeId: "rt-b", sourceId: "src-b", selectors: ["div.b"] },
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
          suggestedDiffs: [
            {
              diff: "--- a/flex.tsx\n+++ b/flex.tsx\n@@ -1,1 +1,1 @@\n-gap-2\n+gap-4",
              confidence: "high",
              preconditions: ["verify after HMR"],
              kind: "tailwind-token-replace",
            },
          ],
          layoutContext: { gridColumns: 12, autoLayout: "fill" },
          adapterWarnings: [
            { code: "tailwind-dynamic", message: "dynamic class", severity: "warning" },
          ],
          screenshotRef: {
            artifactId: "shot-v1-0001",
            redactionSummary: { totalMasked: 2, postCaptureRecheck: "pass" },
          },
        };
      },
    };
  }

  it("vision_get_source_context returns all V1 fields in JSON", async () => {
    const server = createMcpServer(createV1ContextDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_source_context", arguments: {} });
    const text = extractText(result);
    const data = JSON.parse(text) as Record<string, unknown>;
    expect(data.multiSelect).toBeDefined();
    expect((data.multiSelect as { groupId: string }).groupId).toBe("grp-v1-mcp-0001");
    expect(data.breakpoint).toBeDefined();
    expect((data.breakpoint as { activeViewport: string }).activeViewport).toBe("tablet");
    expect(data.sourceConfidenceDetail).toBeDefined();
    expect((data.sourceConfidenceDetail as { method: string }).method).toBe("marker");
    expect(Array.isArray(data.suggestedDiffs)).toBe(true);
    expect(data.layoutContext).toBeDefined();
    expect(Array.isArray(data.adapterWarnings)).toBe(true);
    expect(data.screenshotRef).toBeDefined();
  });

  it("vision_get_source_context returns markdown when format=markdown", async () => {
    const server = createMcpServer(createV1ContextDeps());
    const client = await connectClient(server);
    const result = await client.callTool({
      name: "vision_get_source_context",
      arguments: { format: "markdown" },
    });
    const text = extractText(result);
    expect(text).toContain("# Agent Context");
    expect(text).toContain("## Multi-Select Group");
    expect(text).toContain("## Breakpoint Context");
    expect(text).toContain("## Suggested Diffs");
    expect(text).toContain("## Screenshot Reference");
  });

  it("the V1 context carries a verification plan with V1 assertion descriptions", async () => {
    const server = createMcpServer(createV1ContextDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_source_context", arguments: {} });
    const text = extractText(result);
    const data = JSON.parse(text) as {
      verificationPlan: { assertions: { description: string }[] };
    };
    const descriptions = data.verificationPlan.assertions.map((a) => a.description);
    expect(descriptions.some((d) => d.includes("grid-reorder"))).toBe(true);
    expect(descriptions.some((d) => d.includes("breakpoint"))).toBe(true);
  });

  it("the screenshot ref carries only metadata, never image bytes", async () => {
    const server = createMcpServer(createV1ContextDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_source_context", arguments: {} });
    const text = extractText(result);
    const data = JSON.parse(text) as { screenshotRef: Record<string, unknown> };
    const ref = data.screenshotRef;
    expect(ref.artifactId).toBe("shot-v1-0001");
    expect(ref).not.toHaveProperty("bytes");
    expect(ref).not.toHaveProperty("data");
    expect(ref).not.toHaveProperty("blob");
    expect(ref).not.toHaveProperty("imageData");
    const stringified = JSON.stringify(ref);
    expect(stringified).not.toMatch(/data:image\//i);
  });
});

describe("mcp-server tool calls", () => {
  it("returns active session data", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_active_session", arguments: {} });
    const text = extractText(result);
    const data = JSON.parse(text) as { sessionId: string; connected: boolean };
    expect(data.sessionId).toBe("sess-test12345678");
    expect(data.connected).toBe(true);
  });

  it("returns changeset operations", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_changeset", arguments: {} });
    const data = JSON.parse(extractText(result)) as { operationCount: number };
    expect(data.operationCount).toBe(1);
  });

  it("returns diagnostics", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_diagnostics", arguments: {} });
    const data = JSON.parse(extractText(result)) as Array<{ code: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]?.code).toBe("LOW_CONFIDENCE");
  });

  it("marks patch started with input args", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({
      name: "vision_mark_patch_started",
      arguments: { patchId: "patch-12345678", description: "change color" },
    });
    const data = JSON.parse(extractText(result)) as { acknowledged: boolean };
    expect(data.acknowledged).toBe(true);
  });
});

describe("mcp-server redaction", () => {
  it("redacts sensitive keys from tool responses", () => {
    const result = textResult({ password: "VC_SECRET_SHOULD_NOT_EXPORT", data: "ok" });
    const text = extractText(result);
    expect(text).not.toContain("VC_SECRET_SHOULD_NOT_EXPORT");
    expect(text).toContain("[REDACTED");
    expect(text).toContain("ok");
  });

  it("redacts high-entropy tokens from strings", () => {
    const token = "REDACTED_TEST_TOKEN";
    const result = textResult({ token });
    const text = extractText(result);
    expect(text).not.toContain(token);
  });
});

describe("mcp-server tool schemas", () => {
  const schemas = [
    ["GetActiveSessionOutputSchema", GetActiveSessionOutputSchema],
    ["GetSelectionOutputSchema", GetSelectionOutputSchema],
    ["GetChangesetOutputSchema", GetChangesetOutputSchema],
    ["GetVerificationPlanOutputSchema", GetVerificationPlanOutputSchema],
    ["GetDiagnosticsOutputSchema", GetDiagnosticsOutputSchema],
    ["CaptureElementOutputSchema", CaptureElementOutputSchema],
    ["CoordinationResultSchema", CoordinationResultSchema],
  ] as const;

  it.each(schemas)("%s produces a valid JSON Schema", (_label, schema) => {
    const jsonSchema = z.toJSONSchema(schema);
    expect(["object", "array"]).toContain(jsonSchema.type);
    if (jsonSchema.type === "object") {
      expect(jsonSchema.properties).toBeDefined();
    }
  });

  it("each registered tool has a valid inputSchema in the listing", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("GetChangesetOutputSchema validates V1 operation detail fields", () => {
    const v1Changeset = {
      sessionId: "sess-v1mcp-test1",
      operationCount: 4,
      operations: [
        {
          id: "op-a-00000001",
          kind: "multi-select-group",
          runtime: false,
          description: "group",
          groupId: "g1",
          targetCount: 3,
        },
        {
          id: "op-b-00000001",
          kind: "breakpoint-style-edit",
          runtime: false,
          description: "bp",
          breakpoint: "md",
        },
        {
          id: "op-c-00000001",
          kind: "screenshot-crop-ref",
          runtime: false,
          description: "shot",
          artifactId: "shot-1",
        },
        {
          id: "op-d-00000001",
          kind: "suggested-diff",
          runtime: false,
          description: "diff",
          suggestedDiff: "-a\n+b",
        },
      ],
    };
    expect(GetChangesetOutputSchema.safeParse(v1Changeset).success).toBe(true);
  });

  it("GetChangesetOutputSchema still validates an MVP-only changeset", () => {
    const mvpChangeset = {
      sessionId: "sess-mvp-test001",
      operationCount: 1,
      operations: [
        { id: "op-mvp-000001", kind: "style-edit", runtime: false, description: "color" },
      ],
    };
    expect(GetChangesetOutputSchema.safeParse(mvpChangeset).success).toBe(true);
  });
});

function extractText(result: unknown): string {
  if (typeof result !== "object" || result === null) return "";
  const content = (result as { content?: unknown[] }).content;
  const first = content?.[0];
  if (first !== undefined && typeof first === "object" && first !== null && "text" in first) {
    const text = (first as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}
