import type { IncomingMessage } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import {
  checkAuth,
  createMcpServer,
  createStubDeps,
  type HttpTransportHandle,
  startHttpTransport,
} from "./index.js";

const AUTH_TOKEN = "test-token-1234567890";

describe("mcp-server HTTP auth", () => {
  it("rejects requests without Authorization header", () => {
    const req = mockRequest("http://127.0.0.1:4322/mcp", { origin: "http://localhost:5173" });
    const result = checkAuth(req, { token: AUTH_TOKEN });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNAUTHORIZED");
      expect(result.status).toBe(401);
    }
  });

  it("rejects requests with wrong token", () => {
    const req = mockRequest("http://127.0.0.1:4322/mcp", {
      origin: "http://localhost:5173",
      authorization: "Bearer wrong-token",
    });
    const result = checkAuth(req, { token: AUTH_TOKEN });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNAUTHORIZED");
  });

  it("rejects requests from disallowed origins", () => {
    const req = mockRequest("http://127.0.0.1:4322/mcp", {
      origin: "https://evil.com",
      authorization: `Bearer ${AUTH_TOKEN}`,
    });
    const result = checkAuth(req, { token: AUTH_TOKEN });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("accepts requests with correct token and allowed origin", () => {
    const req = mockRequest("http://127.0.0.1:4322/mcp", {
      origin: "http://localhost:5173",
      authorization: `Bearer ${AUTH_TOKEN}`,
    });
    const result = checkAuth(req, { token: AUTH_TOKEN });
    expect(result.ok).toBe(true);
  });

  it("rejects requests with no origin (mirrors daemon-core strict origin check)", () => {
    const req = mockRequest("http://127.0.0.1:4322/mcp", { authorization: `Bearer ${AUTH_TOKEN}` });
    const result = checkAuth(req, { token: AUTH_TOKEN });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("ORIGIN_NOT_ALLOWED");
      expect(result.status).toBe(403);
    }
  });
});

describe("mcp-server HTTP transport", () => {
  let handle: HttpTransportHandle | undefined;

  afterEach(async () => {
    if (handle !== undefined) {
      await handle.stop();
      handle = undefined;
    }
  });

  it("binds to loopback and serves authenticated requests", async () => {
    const server = createMcpServer(createStubDeps());
    handle = await startHttpTransport(server, { port: 0, auth: { token: AUTH_TOKEN } });
    expect(handle.host).toBe("127.0.0.1");

    const response = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        origin: "http://localhost:5173",
        authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: mcpRequest("tools/list"),
    });
    expect(response.status).toBe(200);
  });

  it("rejects unauthenticated requests without leaking context", async () => {
    const server = createMcpServer(createStubDeps());
    handle = await startHttpTransport(server, { port: 0, auth: { token: AUTH_TOKEN } });

    const response = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:5173" },
      body: mcpRequest("tools/list"),
    });
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("UNAUTHORIZED");
    expect(JSON.stringify(body)).not.toContain("session");
    expect(JSON.stringify(body)).not.toContain("selection");
  });

  it("rejects requests with no Origin header even with a valid token", async () => {
    const server = createMcpServer(createStubDeps());
    handle = await startHttpTransport(server, { port: 0, auth: { token: AUTH_TOKEN } });

    const response = await fetch(`http://127.0.0.1:${handle.port}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: mcpRequest("tools/list"),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("refuses to bind to non-loopback hosts", async () => {
    const server = createMcpServer(createStubDeps());
    await expect(
      startHttpTransport(server, { port: 0, host: "0.0.0.0", auth: { token: AUTH_TOKEN } }),
    ).rejects.toThrow("Loopback only");
  });
});

function mockRequest(url: string, headers: Record<string, string>): IncomingMessage {
  const req = {
    headers,
    url,
  } as unknown as IncomingMessage;
  return req;
}

function mcpRequest(method: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} });
}
