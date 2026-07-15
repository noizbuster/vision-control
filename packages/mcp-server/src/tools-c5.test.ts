import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import {
  createCommandQueue,
  createMcpServer,
  createProjectionCache,
  createProjectionDeps,
  type McpServerDeps,
  minimalSnapshot,
  TOOL_NAMES,
} from "./index.js";

const C5_TOOL_NAMES = [
  "vision_get_active_session",
  "vision_get_selection",
  "vision_get_changeset",
  "vision_get_source_context",
  "vision_get_verification_plan",
  "vision_clear_preview",
  "vision_request_verification",
  "vision_mark_patch_started",
  "vision_mark_patch_completed",
] as const;

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

async function connectClient(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

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

describe("mcp-server tool registration (ADR-020 C5)", () => {
  it("TOOL_NAMES is exactly the nine C5 product tools", () => {
    expect([...TOOL_NAMES]).toEqual([...C5_TOOL_NAMES]);
    expect(TOOL_NAMES).toHaveLength(9);
  });

  it("registers exactly the nine C5 tools and no others", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...C5_TOOL_NAMES].sort());
    expect(tools).toHaveLength(9);
  });

  it("does not register dropped capture or diagnostics tools", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("vision_capture_element");
    expect(names).not.toContain("vision_get_diagnostics");
  });

  it("does NOT register vision_apply_deterministic_patch", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    const forbidden = "vision_" + "apply_deterministic_patch";
    expect(names).not.toContain(forbidden);
  });

  it("the tool list contains NO source-write / apply / patch / codemod tool", async () => {
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
    expect(names.filter(sourceMutating)).toEqual([]);
  });
});

describe("mcp-server each C5 tool (fake deps)", () => {
  it("vision_get_active_session returns session data", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_active_session", arguments: {} });
    const data = JSON.parse(extractText(result)) as { sessionId: string; connected: boolean };
    expect(data.sessionId).toBe("sess-test12345678");
    expect(data.connected).toBe(true);
  });

  it("vision_get_selection returns selection summary", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_selection", arguments: {} });
    const data = JSON.parse(extractText(result)) as { elementTag: string; selector?: string };
    expect(data.elementTag).toBe("button");
    expect(data.selector).toBe("#save");
  });

  it("vision_get_changeset returns operations", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_changeset", arguments: {} });
    const data = JSON.parse(extractText(result)) as { operationCount: number };
    expect(data.operationCount).toBe(1);
  });

  it("vision_get_source_context errors when context is unavailable", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_source_context", arguments: {} });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(extractText(result)).toContain("not available");
  });

  it("vision_get_verification_plan returns assertions without stale passed:true", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_get_verification_plan", arguments: {} });
    const data = JSON.parse(extractText(result)) as {
      assertions: { description: string }[];
      notes: string;
      passed?: boolean;
    };
    expect(data.assertions).toHaveLength(1);
    expect(data.notes).toBe("stub plan");
    expect(data.passed).not.toBe(true);
  });

  it("vision_clear_preview acknowledges", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_clear_preview", arguments: {} });
    const data = JSON.parse(extractText(result)) as { acknowledged: boolean };
    expect(data.acknowledged).toBe(true);
  });

  it("vision_request_verification acknowledges", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({ name: "vision_request_verification", arguments: {} });
    const data = JSON.parse(extractText(result)) as { acknowledged: boolean };
    expect(data.acknowledged).toBe(true);
  });

  it("vision_mark_patch_started accepts patchId", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({
      name: "vision_mark_patch_started",
      arguments: { patchId: "patch-12345678", description: "change color" },
    });
    const data = JSON.parse(extractText(result)) as { acknowledged: boolean };
    expect(data.acknowledged).toBe(true);
  });

  it("vision_mark_patch_completed accepts success flag", async () => {
    const server = createMcpServer(createFakeDeps());
    const client = await connectClient(server);
    const result = await client.callTool({
      name: "vision_mark_patch_completed",
      arguments: { patchId: "patch-12345678", success: true },
    });
    const data = JSON.parse(extractText(result)) as { acknowledged: boolean };
    expect(data.acknowledged).toBe(true);
  });
});

describe("mcp-server C5 tools on projection cache", () => {
  function liveProjectionDeps(sendCommand?: (p: { commandId: string }) => boolean) {
    const cache = createProjectionCache();
    const commands = createCommandQueue({ uuid: () => "cmd-c5-01" });
    const clock = 1_000;
    cache.markPaired(clock);
    const snap = minimalSnapshot({
      tabId: "tab-c5",
      snapshotRev: 2,
      sessionId: "sess-c5",
      selectionTag: "button",
    });
    cache.ingest({
      tabId: "tab-c5",
      sessionId: "sess-c5",
      snapshotRev: 2,
      snapshot: snap,
      ingestedAt: clock,
    });
    return createProjectionDeps({
      cache,
      commands,
      now: () => clock,
      sendCommand: sendCommand ?? (() => true),
    });
  }

  it("paired tools return ingested snapshot data", async () => {
    const server = createMcpServer(liveProjectionDeps());
    const client = await connectClient(server);

    const session = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_active_session", arguments: {} })),
    ) as { connected: boolean; sessionId: string; note?: string };
    expect(session.connected).toBe(true);
    expect(session.sessionId).toBe("sess-c5");
    expect(session.note).toBeUndefined();

    const selection = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_selection", arguments: {} })),
    ) as { elementTag: string; sourceId?: string };
    expect(selection.elementTag).toBe("button");
    expect(selection.sourceId).toBe("src-tab-c5");

    const changeset = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_changeset", arguments: {} })),
    ) as { sessionId: string; operationCount: number };
    expect(changeset.sessionId).toBe("sess-c5");
    expect(changeset.operationCount).toBe(0);

    const ctx = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_source_context", arguments: {} })),
    ) as { tabId?: string; snapshotRev?: number };
    expect(ctx.tabId).toBe("tab-c5");
    expect(ctx.snapshotRev).toBe(2);

    const plan = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_verification_plan", arguments: {} })),
    ) as { notes: string; passed?: boolean; assertions: unknown[] };
    expect(plan.assertions).toEqual([]);
    expect(plan.passed).not.toBe(true);
  });

  it("unpaired tools return not_paired / empty and never stale passed:true", async () => {
    const cache = createProjectionCache();
    const commands = createCommandQueue();
    const deps = createProjectionDeps({ cache, commands, now: () => 0 });
    const server = createMcpServer(deps);
    const client = await connectClient(server);

    const session = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_active_session", arguments: {} })),
    ) as { connected: boolean; note?: string };
    expect(session.connected).toBe(false);
    expect(session.note).toBe("not_paired");

    const plan = JSON.parse(
      extractText(await client.callTool({ name: "vision_get_verification_plan", arguments: {} })),
    ) as { notes: string; passed?: boolean; assertions: unknown[] };
    expect(plan.notes).toBe("not_paired");
    expect(plan.assertions).toEqual([]);
    expect(plan.passed).not.toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(/"passed"\s*:\s*true/);

    const clear = JSON.parse(
      extractText(await client.callTool({ name: "vision_clear_preview", arguments: {} })),
    ) as { acknowledged: boolean; message: string };
    expect(clear.acknowledged).toBe(false);
    expect(clear.message).toBe("not_paired");

    const source = await client.callTool({ name: "vision_get_source_context", arguments: {} });
    expect((source as { isError?: boolean }).isError).toBe(true);
  });

  it("coordination tools enqueue when paired with a socket", async () => {
    const server = createMcpServer(liveProjectionDeps(() => true));
    const client = await connectClient(server);
    const clear = JSON.parse(
      extractText(await client.callTool({ name: "vision_clear_preview", arguments: {} })),
    ) as { acknowledged: boolean; message: string };
    expect(clear.acknowledged).toBe(true);
    expect(clear.message).toContain("cmd-c5-01");
  });
});
