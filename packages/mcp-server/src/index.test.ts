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
    expect(names).not.toContain("vision_apply_deterministic_patch");
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
