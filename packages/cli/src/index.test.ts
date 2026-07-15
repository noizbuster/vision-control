import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  HELP_TEXT,
  PACKAGE_NAME,
  parseCommand,
  REMOVED_COMMANDS,
  resolveMcpBinary,
  runCli,
  runMcp,
} from "./index.js";

describe("cli package", () => {
  it("exposes the package name sentinel", () => {
    expect(PACKAGE_NAME).toBe("@vision-control/cli");
  });
});

describe("cli arg parsing", () => {
  it("parses the top-level command", () => {
    expect(parseCommand(["mcp"]).command).toBe("mcp");
    expect(parseCommand(["help"]).command).toBe("help");
  });

  it("returns undefined command for empty argv", () => {
    expect(parseCommand([]).command).toBeUndefined();
  });

  it("passes remaining args as rest", () => {
    const { command, rest } = parseCommand(["mcp", "--verbose"]);
    expect(command).toBe("mcp");
    expect(rest).toEqual(["--verbose"]);
  });
});

describe("cli help surface", () => {
  it("prints help and returns 0 for --help", async () => {
    const code = await runCli(["--help"]);
    expect(code).toBe(0);
  });

  it("prints help and returns 0 for help", async () => {
    const code = await runCli(["help"]);
    expect(code).toBe(0);
  });

  it("prints help and returns 0 for empty argv", async () => {
    const code = await runCli([]);
    expect(code).toBe(0);
  });

  it("lists only mcp and help as product commands", () => {
    expect(HELP_TEXT).toContain("mcp");
    expect(HELP_TEXT).toMatch(/\bhelp\b/);
    for (const removed of REMOVED_COMMANDS) {
      // Removed names must not appear as Commands table entries.
      expect(HELP_TEXT).not.toMatch(new RegExp(`^\\s+${removed}\\b`, "m"));
    }
  });
});

describe("cli removed product commands", () => {
  for (const command of REMOVED_COMMANDS) {
    it(`rejects ${command} with non-zero exit`, async () => {
      const stderrChunks: string[] = [];
      const original = process.stderr.write.bind(process.stderr);
      process.stderr.write = ((data: string | Uint8Array) => {
        stderrChunks.push(typeof data === "string" ? data : Buffer.from(data).toString("utf8"));
        return true;
      }) as typeof process.stderr.write;
      try {
        const code = await runCli([command]);
        expect(code).toBe(1);
        const stderr = stderrChunks.join("");
        expect(stderr).toContain(command);
        expect(stderr.toLowerCase()).toMatch(/removed|adr-020/);
        expect(stderr).toContain("vision-control mcp");
      } finally {
        process.stderr.write = original;
      }
    });
  }

  it("returns 1 for unknown commands", async () => {
    const code = await runCli(["unknown-command"]);
    expect(code).toBe(1);
  });
});

describe("cli mcp launcher", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir !== undefined) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("returns 1 when the MCP binary path does not exist", async () => {
    const stderrChunks: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((data: string | Uint8Array) => {
      stderrChunks.push(typeof data === "string" ? data : Buffer.from(data).toString("utf8"));
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await runMcp([], {
        env: { ...process.env, VC_MCP_BIN: "/no/such/mcp-server-bin.js" },
        spawnImpl: () => {
          throw new Error("spawn must not run when binary is missing");
        },
      });
      expect(code).toBe(1);
      expect(stderrChunks.join("")).toMatch(/mcp binary not found/i);
    } finally {
      process.stderr.write = original;
    }
  });

  it("returns 1 when spawn fails", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "vc-cli-mcp-"));
    const stub = join(tempDir, "exists-but-spawn-fails.js");
    writeFileSync(stub, "process.exit(0);\n");

    const stderrChunks: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((data: string | Uint8Array) => {
      stderrChunks.push(typeof data === "string" ? data : Buffer.from(data).toString("utf8"));
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await runMcp([], {
        env: { ...process.env, VC_MCP_BIN: stub },
        spawnImpl: () => {
          const child = new EventEmitter() as ChildProcess;
          queueMicrotask(() => {
            child.emit("error", new Error("ENOENT"));
          });
          return child;
        },
      });
      expect(code).toBe(1);
      expect(stderrChunks.join("").toLowerCase()).toMatch(/failed to start mcp/);
    } finally {
      process.stderr.write = original;
    }
  });

  it("spawns node with the MCP binary and remaining args", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "vc-cli-mcp-"));
    const stub = join(tempDir, "stub-mcp.js");
    const out = join(tempDir, "argv.json");
    writeFileSync(
      stub,
      [
        "import { writeFileSync } from 'node:fs';",
        "writeFileSync(process.env.VC_STUB_OUT, JSON.stringify(process.argv.slice(2)));",
        "process.exit(0);",
      ].join("\n"),
    );

    const launchCode = await runMcp(["passthrough-flag"], {
      env: { ...process.env, VC_MCP_BIN: stub, VC_STUB_OUT: out },
    });
    expect(launchCode).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(["passthrough-flag"]);
  });

  it("runCli mcp dispatches to the launcher", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "vc-cli-mcp-"));
    const stub = join(tempDir, "stub-mcp.js");
    const out = join(tempDir, "argv.json");
    writeFileSync(
      stub,
      [
        "import { writeFileSync } from 'node:fs';",
        "writeFileSync(process.env.VC_STUB_OUT, JSON.stringify({ ok: true }));",
        "process.exit(0);",
      ].join("\n"),
    );

    const saved = process.env.VC_MCP_BIN;
    const savedOut = process.env.VC_STUB_OUT;
    process.env.VC_MCP_BIN = stub;
    process.env.VC_STUB_OUT = out;
    try {
      const code = await runCli(["mcp"]);
      expect(code).toBe(0);
      expect(JSON.parse(readFileSync(out, "utf8"))).toEqual({ ok: true });
    } finally {
      if (saved === undefined) delete process.env.VC_MCP_BIN;
      else process.env.VC_MCP_BIN = saved;
      if (savedOut === undefined) delete process.env.VC_STUB_OUT;
      else process.env.VC_STUB_OUT = savedOut;
    }
  });

  it("resolveMcpBinary prefers an existing VC_MCP_BIN", () => {
    tempDir = mkdtempSync(join(tmpdir(), "vc-cli-mcp-"));
    const stub = join(tempDir, "custom-mcp.js");
    writeFileSync(stub, "export {};\n");
    expect(resolveMcpBinary({ VC_MCP_BIN: stub })).toBe(stub);
  });

  it("resolveMcpBinary ignores a missing VC_MCP_BIN path", () => {
    expect(resolveMcpBinary({ VC_MCP_BIN: "/no/such/custom-mcp.js" })).toBeUndefined();
  });
});
