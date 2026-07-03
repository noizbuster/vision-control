import { describe, expect, it, vi } from "vitest";

import {
  type ActiveSessionRead,
  type ChangesetServiceRead,
  type ConnectionServiceDispatch,
  type ContextCompilerRead,
  type CurrentChangesetRead,
  createDaemonMcpDeps,
  type DaemonMcpDepsServices,
  type SelectionChangedRead,
  type SessionServiceRead,
  type VerificationCoordinatorRead,
  type VerificationPlanRead,
} from "./daemon-deps.js";

/** A connected session returned by the fake session service. */
const CONNECTED_SESSION: ActiveSessionRead = {
  sessionId: "sess-live-0001",
  workspaceId: "ws-live",
  connected: true,
  clientVersion: "1.4.0",
  protocolVersion: "2.0.0",
};

const CONNECTED_SELECTION: SelectionChangedRead = {
  elementId: "el-btn-save",
  elementTag: "button",
  selector: "#save",
  sourceId: "src-save-001",
  textPreview: "Save",
};

const REAL_OPERATIONS: CurrentChangesetRead = {
  changesetId: "cs-live-0001",
  operations: [
    { id: "op-0001", kind: "style-edit", runtime: false, description: "Set color to red" },
    { id: "op-0002", kind: "class-toggle", runtime: true, description: "Add .primary" },
  ],
};

const REAL_PLAN: VerificationPlanRead = {
  assertions: [
    { description: "Element color is red after HMR" },
    { description: "Class .primary is present" },
  ],
  notes: "plan compiled by verification engine",
};

/** Build a fully-populated service set backed by in-memory fakes + spies. */
function createLiveServices(): {
  readonly services: DaemonMcpDepsServices;
  readonly sendVerificationRequested: ReturnType<typeof vi.fn>;
  readonly sendPreviewClearRequested: ReturnType<typeof vi.fn>;
} {
  const sendVerificationRequested = vi.fn();
  const sendPreviewClearRequested = vi.fn();

  const sessionService: SessionServiceRead = {
    async getActive() {
      return CONNECTED_SESSION;
    },
    async getLastSelection() {
      return CONNECTED_SELECTION;
    },
  };
  const changesetService: ChangesetServiceRead = {
    async getCurrent() {
      return REAL_OPERATIONS;
    },
  };
  const contextCompiler: ContextCompilerRead = {
    compile(input) {
      return { compiled: true, sessionId: input.sessionId, format: "json" };
    },
  };
  const verificationCoordinator: VerificationCoordinatorRead = {
    async getPlan() {
      return REAL_PLAN;
    },
  };
  const connectionService: ConnectionServiceDispatch = {
    sendVerificationRequested,
    sendPreviewClearRequested,
  };

  return {
    services: {
      sessionService,
      changesetService,
      contextCompiler,
      verificationCoordinator,
      connectionService,
    },
    sendVerificationRequested,
    sendPreviewClearRequested,
  };
}

describe("createDaemonMcpDeps — live data", () => {
  it("getActiveSession returns the real connected session when one is active", async () => {
    const deps = createDaemonMcpDeps(createLiveServices().services);
    const session = await deps.getActiveSession();
    expect(session.connected).toBe(true);
    expect(session.sessionId).toBe("sess-live-0001");
    expect(session.workspaceId).toBe("ws-live");
    expect(session.protocolVersion).toBe("2.0.0");
    expect(session.clientVersion).toBe("1.4.0");
    expect(session.note).toBeUndefined();
  });

  it("getChangeset returns REAL operations (not operationCount: 0)", async () => {
    const deps = createDaemonMcpDeps(createLiveServices().services);
    const changeset = await deps.getChangeset();
    expect(changeset.sessionId).toBe("sess-live-0001");
    expect(changeset.operationCount).toBe(2);
    expect(changeset.operations).toHaveLength(2);
    const first = changeset.operations[0];
    expect(first?.id).toBe("op-0001");
    expect(first?.kind).toBe("style-edit");
    expect(first?.description).toBe("Set color to red");
    const second = changeset.operations[1];
    expect(second?.runtime).toBe(true);
  });

  it("getSelection returns the last selection.changed payload", async () => {
    const deps = createDaemonMcpDeps(createLiveServices().services);
    const selection = await deps.getSelection();
    expect(selection.sessionId).toBe("sess-live-0001");
    expect(selection.elementTag).toBe("button");
    expect(selection.selector).toBe("#save");
    expect(selection.sourceId).toBe("src-save-001");
    expect(selection.textPreview).toBe("Save");
  });

  it("getSourceContext delegates to the context compiler", async () => {
    const deps = createDaemonMcpDeps(createLiveServices().services);
    const context = (await deps.getSourceContext()) as { compiled: boolean; sessionId: string };
    expect(context.compiled).toBe(true);
    expect(context.sessionId).toBe("sess-live-0001");
  });

  it("getVerificationPlan returns the real plan from the coordinator", async () => {
    const deps = createDaemonMcpDeps(createLiveServices().services);
    const plan = await deps.getVerificationPlan();
    expect(plan.assertions).toHaveLength(2);
    expect(plan.assertions[0]?.description).toBe("Element color is red after HMR");
    expect(plan.notes).toBe("plan compiled by verification engine");
  });
});

describe("createDaemonMcpDeps — no active session", () => {
  function createNoSessionServices(): DaemonMcpDepsServices {
    const sessionService: SessionServiceRead = {
      async getActive() {
        return undefined;
      },
    };
    return { sessionService };
  }

  it("getActiveSession returns connected: false WITH a note", async () => {
    const deps = createDaemonMcpDeps(createNoSessionServices());
    const session = await deps.getActiveSession();
    expect(session.connected).toBe(false);
    expect(session.note).toBeTruthy();
    expect(typeof session.note).toBe("string");
  });

  it("getChangeset degrades to an empty changeset (operationCount: 0) when no session", async () => {
    const deps = createDaemonMcpDeps(createNoSessionServices());
    const changeset = await deps.getChangeset();
    expect(changeset.operationCount).toBe(0);
    expect(changeset.operations).toEqual([]);
  });

  it("getSelection degrades to an unknown-element shape when no session", async () => {
    const deps = createDaemonMcpDeps(createNoSessionServices());
    const selection = await deps.getSelection();
    expect(selection.elementTag).toBe("unknown");
    expect(selection.selector).toBeUndefined();
  });

  it("getSourceContext returns undefined when no session (tool surfaces 'not available')", async () => {
    const deps = createDaemonMcpDeps({
      sessionService: {
        async getActive() {
          return undefined;
        },
      },
      contextCompiler: {
        compile() {
          return { compiled: true };
        },
      },
    });
    const context = await deps.getSourceContext();
    expect(context).toBeUndefined();
  });
});

describe("createDaemonMcpDeps — §25.2 dispatch", () => {
  it("requestVerification dispatches verification.requested via connectionService", async () => {
    const { services, sendVerificationRequested } = createLiveServices();
    const deps = createDaemonMcpDeps(services);
    const result = await deps.requestVerification();
    expect(result.acknowledged).toBe(true);
    expect(sendVerificationRequested).toHaveBeenCalledOnce();
    const body = sendVerificationRequested.mock.calls[0]?.[0] as {
      changesetId: string;
      timeoutMs: number;
    };
    expect(body.changesetId).toBe("cs-live-0001");
    expect(body.timeoutMs).toBeGreaterThan(0);
  });

  it("clearPreview dispatches preview.clearRequested via connectionService", async () => {
    const { services, sendPreviewClearRequested } = createLiveServices();
    const deps = createDaemonMcpDeps(services);
    const result = await deps.clearPreview();
    expect(result.acknowledged).toBe(true);
    expect(sendPreviewClearRequested).toHaveBeenCalledOnce();
    const body = sendPreviewClearRequested.mock.calls[0]?.[0] as {
      changesetId?: string;
      reason: string;
    };
    expect(body.changesetId).toBe("cs-live-0001");
    expect(body.reason).toContain("clear");
  });

  it("requestVerification degrades when no connectionService is wired", async () => {
    const deps = createDaemonMcpDeps({
      sessionService: {
        async getActive() {
          return CONNECTED_SESSION;
        },
      },
    });
    const result = await deps.requestVerification();
    expect(result.acknowledged).toBe(false);
  });
});

describe("createDaemonMcpDeps — patch lifecycle", () => {
  it("markPatchStarted acknowledges (patch lifecycle is recorded server-side)", async () => {
    const deps = createDaemonMcpDeps(createLiveServices().services);
    const result = await deps.markPatchStarted({ patchId: "patch-0001", description: "recolor" });
    expect(result.acknowledged).toBe(true);
    expect(result.message).toContain("patch-0001");
  });

  it("markPatchCompleted acknowledges the success outcome", async () => {
    const deps = createDaemonMcpDeps(createLiveServices().services);
    const result = await deps.markPatchCompleted({ patchId: "patch-0001", success: true });
    expect(result.acknowledged).toBe(true);
    expect(result.message).toContain("completed");
  });

  it("markPatchCompleted acknowledges the failure outcome", async () => {
    const deps = createDaemonMcpDeps({});
    const result = await deps.markPatchCompleted({ patchId: "patch-0002", success: false });
    expect(result.acknowledged).toBe(true);
    expect(result.message).toContain("failed");
  });
});

describe("createDaemonMcpDeps — graceful degradation with no services", () => {
  it("never throws when constructed with an empty service set", async () => {
    const deps = createDaemonMcpDeps({});
    await expect(deps.getActiveSession()).resolves.toMatchObject({ connected: false });
    await expect(deps.getSelection()).resolves.toMatchObject({ elementTag: "unknown" });
    await expect(deps.getChangeset()).resolves.toMatchObject({ operationCount: 0 });
    await expect(deps.getSourceContext()).resolves.toBeUndefined();
    await expect(deps.getVerificationPlan()).resolves.toMatchObject({ assertions: [] });
    await expect(deps.getDiagnostics()).resolves.toEqual([]);
    await expect(deps.captureElement()).resolves.toMatchObject({ captured: false });
    await expect(deps.requestVerification()).resolves.toMatchObject({ acknowledged: false });
    await expect(deps.clearPreview()).resolves.toMatchObject({ acknowledged: false });
  });

  it("getVerificationPlan returns a note when no coordinator is wired", async () => {
    const deps = createDaemonMcpDeps({});
    const plan = await deps.getVerificationPlan();
    expect(plan.assertions).toEqual([]);
    expect(plan.notes).toBeTruthy();
  });
});

describe("createDaemonMcpDeps — McpServerDeps contract conformance", () => {
  it("returns an object satisfying every McpServerDeps method", () => {
    const deps = createDaemonMcpDeps({});
    for (const method of [
      "getActiveSession",
      "getSelection",
      "getChangeset",
      "getSourceContext",
      "getVerificationPlan",
      "getDiagnostics",
      "captureElement",
      "requestVerification",
      "clearPreview",
      "markPatchStarted",
      "markPatchCompleted",
    ] as const) {
      expect(typeof deps[method]).toBe("function");
    }
  });

  it("getDiagnostics is an empty array (no diagnostic provider in scope)", async () => {
    const deps = createDaemonMcpDeps(createLiveServices().services);
    const diagnostics = await deps.getDiagnostics();
    expect(diagnostics).toEqual([]);
  });
});
