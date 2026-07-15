import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROTOCOL_VERSION, parseMessage } from "@vision-control/protocol";
import { describe, expect, it } from "vitest";
import { loadConfig, type VisionControlConfig } from "./config-loader.js";
import { DEFAULT_HOST, HELP_TEXT, parseArgs } from "./index.js";

describe("parseArgs", () => {
  it("parses space-separated options", () => {
    const parsed = parseArgs(["--host", "::1", "--port", "8080", "--workspace", "/tmp/ws"]);
    expect(parsed).toEqual({
      help: false,
      open: false,
      noOpen: false,
      host: "::1",
      port: 8080,
      workspace: "/tmp/ws",
    });
  });

  it("parses equals-form options", () => {
    const parsed = parseArgs(["--host=localhost", "--port=9", "--db=/tmp/x.db"]);
    expect(parsed.host).toBe("localhost");
    expect(parsed.port).toBe(9);
    expect(parsed.db).toBe("/tmp/x.db");
    expect(parsed.open).toBe(false);
    expect(parsed.noOpen).toBe(false);
  });

  it("detects --help and -h", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["--port", "80"]).help).toBe(false);
  });

  it("defaults host to loopback sentinel when absent", () => {
    expect(DEFAULT_HOST).toBe("127.0.0.1");
    expect(parseArgs([]).help).toBe(false);
    expect(parseArgs([]).open).toBe(false);
    expect(parseArgs([]).noOpen).toBe(false);
  });

  it("parses --open", () => {
    expect(parseArgs(["--open"]).open).toBe(true);
    expect(parseArgs(["--open"]).noOpen).toBe(false);
  });

  it("parses --no-open", () => {
    expect(parseArgs(["--no-open"]).noOpen).toBe(true);
    expect(parseArgs(["--no-open"]).open).toBe(false);
  });

  it("parses both --open and --no-open without dropping either flag", () => {
    const parsed = parseArgs(["--open", "--no-open"]);
    expect(parsed.open).toBe(true);
    expect(parsed.noOpen).toBe(true);
  });

  it("parses open flags mixed with other options in any order", () => {
    const parsed = parseArgs(["--port", "9", "--no-open", "--host", "127.0.0.1", "--open"]);
    expect(parsed.port).toBe(9);
    expect(parsed.host).toBe("127.0.0.1");
    expect(parsed.open).toBe(true);
    expect(parsed.noOpen).toBe(true);
  });
});

describe("HELP_TEXT", () => {
  it("documents the loopback-only constraint", () => {
    expect(HELP_TEXT).toContain("loopback");
    expect(HELP_TEXT).toContain("0.0.0.0");
  });

  it("documents --open, --no-open, and monorepo VC_OPEN_PAIRING open policy", () => {
    expect(HELP_TEXT).toContain("--open");
    expect(HELP_TEXT).toContain("--no-open");
    expect(HELP_TEXT).toContain("VC_OPEN_PAIRING");
    expect(HELP_TEXT).toContain("do not open a browser");
    expect(HELP_TEXT).toContain("127.0.0.1");
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

describe("daemon V1 context pass-through (VC-V1V2-16)", () => {
  it("protocol version is 2.0.0 (§25 catalog, breaking)", () => {
    expect(PROTOCOL_VERSION).toBe("2.0.0");
  });

  it("a changeset.updated with a V1 context payload parses successfully", () => {
    const v1Payload = {
      type: "changeset.updated",
      changesetId: "cs-daemon-v1-0001",
      revision: 3,
      operations: [
        {
          kind: "multi-select-group",
          groupId: "grp-daemon-v1-0001",
          targets: [{ runtimeId: "rt-a", selectors: [".a"] }],
        },
        { kind: "breakpoint-style-edit", breakpoint: "md" },
        { kind: "grid-reorder", placement: "dom-order" },
        { kind: "screenshot-crop-ref", artifactId: "shot-1" },
        { kind: "suggested-diff", suggestedDiff: "-a\n+b" },
      ],
    };
    const result = parseMessage(v1Payload);
    expect(result.success).toBe(true);
  });

  it("a changeset.updated payload with V1 operation kinds is preserved", () => {
    const message = {
      type: "changeset.updated",
      changesetId: "cs-v1-ops",
      revision: 1,
      operations: [
        { kind: "multi-select-group", groupId: "g1", targetCount: 3 },
        { kind: "breakpoint-style-edit", breakpoint: "md" },
        { kind: "grid-reorder", placement: "dom-order" },
        { kind: "screenshot-crop-ref", artifactId: "shot-1" },
        { kind: "suggested-diff", suggestedDiff: "-a\n+b" },
      ],
    };
    const result = parseMessage(message);
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "changeset.updated") {
      expect(result.data.operations).toHaveLength(5);
      const kinds = result.data.operations.map((op) => (op as { kind: string }).kind);
      expect(kinds).toContain("multi-select-group");
      expect(kinds).toContain("breakpoint-style-edit");
      expect(kinds).toContain("grid-reorder");
      expect(kinds).toContain("screenshot-crop-ref");
      expect(kinds).toContain("suggested-diff");
    }
  });
});
