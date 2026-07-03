import { describe, expect, it } from "vitest";

import {
  buildHttpEntry,
  buildOpenCodeConfig,
  buildStdioEntry,
  DEFAULT_DAEMON_URL,
  DEFAULT_MCP_HTTP_URL,
  DEFAULT_STDIO_COMMAND,
  MCP_SERVER_KEY,
  PACKAGE_NAME,
  STDIO_BINARY_PATH,
  TRANSPORTS,
} from "./index.js";

describe(PACKAGE_NAME, () => {
  it("exposes the package name and server key", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/opencode");
    expect(MCP_SERVER_KEY).toBe("vision-control");
  });

  it("declares both supported transports", () => {
    expect([...TRANSPORTS]).toEqual(["stdio", "http"]);
  });
});

describe("buildStdioEntry", () => {
  it("uses the default workspace command and daemon url", () => {
    const entry = buildStdioEntry();
    expect(entry).toEqual({
      type: "local",
      command: ["pnpm", "exec", "vision-control-mcp"],
      enabled: true,
      environment: { VC_DAEMON_URL: DEFAULT_DAEMON_URL },
    });
  });

  it("lets a caller override the command for an out-of-workspace agent", () => {
    const entry = buildStdioEntry({ command: ["node", STDIO_BINARY_PATH] });
    expect(entry.command).toEqual(["node", "packages/mcp-server/dist/bin.js"]);
  });

  it("honors a custom daemon url and disabled flag", () => {
    const entry = buildStdioEntry({ daemonUrl: "http://127.0.0.1:9999", enabled: false });
    expect(entry.environment).toEqual({ VC_DAEMON_URL: "http://127.0.0.1:9999" });
    expect(entry.enabled).toBe(false);
  });

  it("never references a source-writing tool (read-only contract)", () => {
    const json = JSON.stringify(buildStdioEntry());
    expect(json).not.toMatch(/vision_apply_/);
    expect(json).not.toMatch(/vision_write_/);
    expect(json).not.toMatch(/vision_codemod_/);
  });
});

describe("buildHttpEntry", () => {
  it("defaults to the loopback endpoint and a placeholder token", () => {
    const entry = buildHttpEntry();
    expect(entry).toEqual({
      type: "url",
      url: DEFAULT_MCP_HTTP_URL,
      enabled: true,
      headers: { Authorization: "Bearer change-me" },
    });
  });

  it("uses a caller-supplied token without inventing a default secret", () => {
    const entry = buildHttpEntry({ token: "tok-from-env" });
    expect(entry.headers.Authorization).toBe("Bearer tok-from-env");
  });

  it("binds only to a loopback url", () => {
    expect(buildHttpEntry().url).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(buildHttpEntry({ url: "http://127.0.0.1:5500/mcp" }).url).toBe(
      "http://127.0.0.1:5500/mcp",
    );
  });
});

describe("buildOpenCodeConfig", () => {
  it("wraps a stdio entry under the vision-control key", () => {
    const config = buildOpenCodeConfig(buildStdioEntry());
    expect(config.mcp[MCP_SERVER_KEY].type).toBe("local");
  });

  it("wraps an http entry under the vision-control key", () => {
    const config = buildOpenCodeConfig(buildHttpEntry());
    expect(config.mcp[MCP_SERVER_KEY].type).toBe("url");
  });

  it("does not import or reference DEFAULT_STDIO_COMMAND as a secret", () => {
    expect(DEFAULT_STDIO_COMMAND).toEqual(["pnpm", "exec", "vision-control-mcp"]);
  });
});
