import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maybeWarnStub, resolveMcpDeps, STUB_WARNING } from "./bin.js";
import { createHttpDaemonServices, type DaemonHttpFetch } from "./http-daemon-deps.js";

/** Live data the fake daemon serves. */
const ACTIVE_SESSION = {
  sessionId: "sess-live-0001",
  workspaceId: "ws-live",
  connected: true,
  protocolVersion: "2.0.0",
  clientVersion: "1.4.0",
};

const SELECTION = {
  elementId: "el-save",
  elementTag: "button",
  selector: "#save",
  sourceId: "src-save-001",
  textPreview: "Save",
};

const CHANGESET = {
  changesetId: "cs-live-0001",
  operations: [
    { id: "op-0001", kind: "style-edit", runtime: false, description: "Set color to red" },
    { id: "op-0002", kind: "class-toggle", runtime: true, description: "Add .primary" },
  ],
};

/** A minimal loopback daemon that serves the `/mcp-read/*` read contract. */
function createFakeDaemon(): Server {
  return createServer((req, res) => {
    const url = req.url ?? "";
    if (url.startsWith("/mcp-read/active-session")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(ACTIVE_SESSION));
      return;
    }
    if (url.startsWith("/mcp-read/selection")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(SELECTION));
      return;
    }
    if (url.startsWith("/mcp-read/changeset")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(CHANGESET));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
}

function baseUrl(server: Server): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("bin resolveMcpDeps — live daemon via VC_DAEMON_URL", () => {
  let server: Server;

  beforeEach(async () => {
    server = createFakeDaemon();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("getChangeset returns LIVE data (operationCount > 0) when VC_DAEMON_URL is set", async () => {
    const { deps, warned } = resolveMcpDeps({ VC_DAEMON_URL: baseUrl(server) });
    expect(warned).toBe(false);
    const changeset = await deps.getChangeset();
    expect(changeset.sessionId).toBe("sess-live-0001");
    expect(changeset.operationCount).toBe(2);
    expect(changeset.operations).toHaveLength(2);
    expect(changeset.operations[0]?.kind).toBe("style-edit");
    expect(changeset.operations[0]?.description).toBe("Set color to red");
    expect(changeset.operations[1]?.runtime).toBe(true);
  });

  it("getActiveSession returns the live connected session (not stub's connected:false)", async () => {
    const { deps } = resolveMcpDeps({ VC_DAEMON_URL: baseUrl(server) });
    const session = await deps.getActiveSession();
    expect(session.connected).toBe(true);
    expect(session.sessionId).toBe("sess-live-0001");
    expect(session.workspaceId).toBe("ws-live");
    expect(session.protocolVersion).toBe("2.0.0");
    expect(session.clientVersion).toBe("1.4.0");
    expect(session.note).toBeUndefined();
  });

  it("getSelection returns the live selection payload from the daemon", async () => {
    const { deps } = resolveMcpDeps({ VC_DAEMON_URL: baseUrl(server) });
    const selection = await deps.getSelection();
    expect(selection.sessionId).toBe("sess-live-0001");
    expect(selection.elementTag).toBe("button");
    expect(selection.selector).toBe("#save");
    expect(selection.sourceId).toBe("src-save-001");
    expect(selection.textPreview).toBe("Save");
  });
});

describe("bin resolveMcpDeps — stub fallback when VC_DAEMON_URL unset", () => {
  it("returns stub deps (operationCount: 0) and flags a warning", async () => {
    const { deps, warned } = resolveMcpDeps({});
    expect(warned).toBe(true);
    const changeset = await deps.getChangeset();
    expect(changeset.operationCount).toBe(0);
    expect(changeset.operations).toEqual([]);
  });

  it("flags a warning for an empty-string VC_DAEMON_URL", () => {
    const { warned } = resolveMcpDeps({ VC_DAEMON_URL: "" });
    expect(warned).toBe(true);
  });

  it("stub getActiveSession reports connected:false (the honest stub shape)", async () => {
    const { deps } = resolveMcpDeps({});
    const session = await deps.getActiveSession();
    expect(session.connected).toBe(false);
  });
});

describe("bin stub warning", () => {
  it("names VC_DAEMON_URL and mentions stub data", () => {
    expect(STUB_WARNING).toContain("VC_DAEMON_URL");
    expect(STUB_WARNING.toLowerCase()).toContain("stub");
  });

  it("maybeWarnStub writes the warning exactly once when warned", () => {
    const write = vi.fn();
    maybeWarnStub(true, write);
    expect(write).toHaveBeenCalledExactlyOnceWith(STUB_WARNING);
  });

  it("maybeWarnStub is silent when not warned", () => {
    const write = vi.fn();
    maybeWarnStub(false, write);
    expect(write).not.toHaveBeenCalled();
  });
});

describe("createHttpDaemonServices — graceful degradation", () => {
  it("returns undefined read models when the daemon is unreachable", async () => {
    // A fetch that always rejects (daemon not running).
    const failingFetch: DaemonHttpFetch = () => Promise.reject(new Error("ECONNREFUSED"));
    const services = createHttpDaemonServices("http://127.0.0.1:1", { fetch: failingFetch });
    await expect(services.sessionService?.getActive()).resolves.toBeUndefined();
    await expect(services.changesetService?.getCurrent("s1")).resolves.toBeUndefined();
  });

  it("returns undefined for a non-200 response", async () => {
    const notFoundFetch: DaemonHttpFetch = () =>
      Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    const services = createHttpDaemonServices("http://127.0.0.1:1", { fetch: notFoundFetch });
    await expect(services.sessionService?.getActive()).resolves.toBeUndefined();
  });

  it("returns undefined when the active-session payload fails validation", async () => {
    const malformedFetch: DaemonHttpFetch = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sessionId: 123 }),
      });
    const services = createHttpDaemonServices("http://127.0.0.1:1", { fetch: malformedFetch });
    await expect(services.sessionService?.getActive()).resolves.toBeUndefined();
  });
});
