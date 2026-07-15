import { describe, expect, it } from "vitest";

import {
  buildHttpEntry,
  buildPiConfig,
  buildStdioEntry,
  DEFAULT_MCP_HTTP_URL,
  DEFAULT_STDIO_COMMAND,
  MCP_SERVER_LABEL,
  PACKAGE_NAME,
  STDIO_BINARY_PATH,
  TRANSPORTS,
} from "./index.js";

describe(PACKAGE_NAME, () => {
  it("exposes the package name and server label", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/pi");
    expect(MCP_SERVER_LABEL).toBe("vision-control");
  });

  it("declares both supported transports", () => {
    expect([...TRANSPORTS]).toEqual(["stdio", "http"]);
  });
});

describe("buildStdioEntry", () => {
  it("uses the default workspace command without VC_DAEMON_URL", () => {
    const entry = buildStdioEntry();
    expect(entry).toEqual({
      transport: "stdio",
      command: ["pnpm", "exec", "vision-control-mcp"],
    });
    expect(entry.environment).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain("VC_DAEMON_URL");
  });

  it("lets a caller override the command for an out-of-workspace agent", () => {
    const entry = buildStdioEntry({ command: ["node", STDIO_BINARY_PATH] });
    expect(entry.command).toEqual(["node", "packages/mcp-server/dist/bin.js"]);
  });

  it("honors optional environment without requiring a daemon url", () => {
    const entry = buildStdioEntry({ environment: { VC_MCP_TOKEN: "from-env" } });
    expect(entry.environment).toEqual({ VC_MCP_TOKEN: "from-env" });
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
      transport: "http",
      url: DEFAULT_MCP_HTTP_URL,
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

describe("buildPiConfig", () => {
  it("wraps a stdio entry under the vision-control label", () => {
    const config = buildPiConfig(buildStdioEntry());
    expect(config.servers[MCP_SERVER_LABEL].transport).toBe("stdio");
  });

  it("wraps an http entry under the vision-control label", () => {
    const config = buildPiConfig(buildHttpEntry());
    expect(config.servers[MCP_SERVER_LABEL].transport).toBe("http");
  });

  it("does not import or reference DEFAULT_STDIO_COMMAND as a secret", () => {
    expect(DEFAULT_STDIO_COMMAND).toEqual(["pnpm", "exec", "vision-control-mcp"]);
  });
});
