import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, type VisionControlConfig } from "./config-loader.js";
import { DEFAULT_HOST, HELP_TEXT, parseArgs } from "./index.js";

describe("parseArgs", () => {
  it("parses space-separated options", () => {
    const parsed = parseArgs(["--host", "::1", "--port", "8080", "--workspace", "/tmp/ws"]);
    expect(parsed).toEqual({ help: false, host: "::1", port: 8080, workspace: "/tmp/ws" });
  });

  it("parses equals-form options", () => {
    const parsed = parseArgs(["--host=localhost", "--port=9", "--db=/tmp/x.db"]);
    expect(parsed.host).toBe("localhost");
    expect(parsed.port).toBe(9);
    expect(parsed.db).toBe("/tmp/x.db");
  });

  it("detects --help and -h", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["--port", "80"]).help).toBe(false);
  });

  it("defaults host to loopback sentinel when absent", () => {
    expect(DEFAULT_HOST).toBe("127.0.0.1");
    expect(parseArgs([]).help).toBe(false);
  });
});

describe("HELP_TEXT", () => {
  it("documents the loopback-only constraint", () => {
    expect(HELP_TEXT).toContain("loopback");
    expect(HELP_TEXT).toContain("0.0.0.0");
  });
});

describe("loadConfig", () => {
  it("loads and validates a vision-control.config.ts file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vc-cfg-"));
    writeFileSync(
      join(dir, "vision-control.config.ts"),
      "export default { workspace: { root: '/tmp/ws' }, origins: ['http://localhost:5173'] };\n",
    );
    const result = await loadConfig(dir);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.config.workspace.root).toBe("/tmp/ws");
      expect(result.config.origins).toEqual(["http://localhost:5173"]);
      expect(result.config.daemon).toEqual({});
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails when no config file is present", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vc-empty-"));
    const result = await loadConfig(dir);
    expect(result.success).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("fails validation when the schema is wrong", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vc-bad-"));
    writeFileSync(join(dir, "vision-control.config.ts"), "export default { origins: [] };\n");
    const result = (await loadConfig(dir)) as
      | VisionControlConfig
      | { success: false; reason: string };
    expect((result as { success: boolean }).success).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
