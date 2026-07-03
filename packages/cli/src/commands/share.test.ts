import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createContext } from "../index.js";
import { parseShareArgs, runShareExport, runShareImport } from "./share.js";

function changesetJson(): string {
  return JSON.stringify({
    id: "cs-1",
    sessionId: "sess-cli",
    operations: [
      {
        id: "op-1",
        kind: "style-edit",
        target: { selectors: [".btn"] },
        property: "color",
        value: "red",
      },
    ],
    createdAt: 1,
    updatedAt: 1,
    committed: false,
  });
}

function contextJson(): string {
  return JSON.stringify({
    goal: "Make the button red",
    target: {
      identity: { selectors: [".btn"] },
      semantic: { tagName: "button", textContentPreview: "Go" },
      breadcrumb: [],
      computedStyle: {},
      boxModel: { contentWidth: 0, contentHeight: 0, positionX: 0, positionY: 0 },
      classList: [],
      attributes: [],
    },
    operations: [],
    source: { candidates: [] },
    layout: { parentMode: "block", parentDisplay: "block", siblingCount: 0, siblingIndex: 0 },
    verificationPlan: { assertions: [], notes: "stub" },
    warnings: [],
    privacyReport: { redactions: [], totalRedacted: 0 },
    metadata: {
      compiledAt: 1,
      formatVersion: "1.1.0",
      tokenBudget: 8000,
      tokenEstimate: 1,
      truncated: false,
      truncatedSections: [],
      operationCount: 0,
    },
  });
}

function sessionJson(): string {
  return JSON.stringify({ sessionId: "sess-cli", workspaceId: "ws-cli" });
}

function mcpResponse(text: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } });
}

async function startMockMcp(): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const tool = JSON.parse(body).params?.name ?? "";
      const text =
        tool === "vision_get_changeset"
          ? changesetJson()
          : tool === "vision_get_source_context"
            ? contextJson()
            : sessionJson();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(mcpResponse(text));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { server, port: (server.address() as { port: number }).port };
}

describe("share arg parsing", () => {
  it("parses export with --out", () => {
    const parsed = parseShareArgs(["export", "--out", "bundle.json"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.subcommand === "export") {
      expect(parsed.out).toBe("bundle.json");
      expect(parsed.includeScreenshots).toBe(false);
    }
  });

  it("parses export with --include-screenshots and --out= form", () => {
    const parsed = parseShareArgs(["export", "--include-screenshots", "--out=bundle.json"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.subcommand === "export") {
      expect(parsed.out).toBe("bundle.json");
      expect(parsed.includeScreenshots).toBe(true);
    }
  });

  it("fails export without --out", () => {
    expect(parseShareArgs(["export"]).ok).toBe(false);
  });

  it("parses import with a path", () => {
    const parsed = parseShareArgs(["import", "/tmp/bundle.json"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.subcommand === "import") {
      expect(parsed.path).toBe("/tmp/bundle.json");
    }
  });

  it("fails import without a path", () => {
    expect(parseShareArgs(["import"]).ok).toBe(false);
  });

  it("fails an unknown subcommand", () => {
    expect(parseShareArgs(["frobnicate"]).ok).toBe(false);
  });
});

describe("share import (local file, no daemon)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vc-share-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function captureStdout<T>(fn: () => Promise<T>): Promise<{ code: T; out: string }> {
    const writes: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (data: string) => {
      writes.push(data);
      return true;
    };
    try {
      const code = await fn();
      return { code, out: writes.join("") };
    } finally {
      process.stdout.write = original;
    }
  }

  it("imports a valid exported bundle and prints the reconstructed content", async () => {
    const { server, port } = await startMockMcp();
    const out = join(dir, "bundle.json");
    const ctx = createContext({ VC_MCP_URL: `http://127.0.0.1:${port}/mcp` });
    try {
      const exportCode = await runShareExport(
        { subcommand: "export", out, includeScreenshots: false },
        ctx,
      );
      expect(exportCode).toBe(0);
    } finally {
      server.close();
    }

    const written = JSON.parse(await readFile(out, "utf8"));
    expect(written.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(written.workspaceId).toBe("ws-cli");

    const { code, out: importOut } = await captureStdout(() =>
      runShareImport({ subcommand: "import", path: out }),
    );
    expect(code).toBe(0);
    expect(importOut).toContain("imported bundle");
    expect(importOut).toContain("reconstructed");
  });

  it("NEGATIVE: rejects a tampered bundle with exit code 1", async () => {
    const { server, port } = await startMockMcp();
    const out = join(dir, "tampered.json");
    const ctx = createContext({ VC_MCP_URL: `http://127.0.0.1:${port}/mcp` });
    try {
      await runShareExport({ subcommand: "export", out, includeScreenshots: false }, ctx);
    } finally {
      server.close();
    }
    const bundle = JSON.parse(await readFile(out, "utf8"));
    bundle.context.goal = "tampered-after-signing";
    await writeFile(out, JSON.stringify(bundle), "utf8");

    const writes: string[] = [];
    const originalErr = process.stderr.write.bind(process.stderr);
    process.stderr.write = (data: string) => {
      writes.push(data);
      return true;
    };
    let code = -1;
    try {
      code = await runShareImport({ subcommand: "import", path: out });
    } finally {
      process.stderr.write = originalErr;
    }
    expect(code).toBe(1);
    expect(writes.join("")).toContain("import rejected");
  });

  it("NEGATIVE: rejects a bundle carrying a raw token field", async () => {
    const out = join(dir, "token.json");
    // Hand-craft a bundle with a raw sessionToken; recompute its hash so it passes
    // integrity, then confirm import still rejects it on the forbidden-token guard.
    const { exportBundle, computeBundleHash } = await import("@vision-control/security");
    const base = await exportBundle({
      workspaceId: "ws",
      sessionId: "sess",
      changeset: { operations: [] },
      context: { goal: "x" },
      now: 1,
      auditId: "e",
    });
    const poisoned = JSON.parse(JSON.stringify(base));
    poisoned.changeset.sessionToken = "VC_RAW_TOKEN_VALUE";
    const content = { ...poisoned };
    delete content.hash;
    delete content.signature;
    poisoned.hash = await computeBundleHash(content);
    poisoned.signature = { algorithm: "sha256-local-v2", value: poisoned.hash };
    await writeFile(out, JSON.stringify(poisoned), "utf8");

    const writes: string[] = [];
    const originalErr = process.stderr.write.bind(process.stderr);
    process.stderr.write = (data: string) => {
      writes.push(data);
      return true;
    };
    let code = -1;
    try {
      code = await runShareImport({ subcommand: "import", path: out });
    } finally {
      process.stderr.write = originalErr;
    }
    expect(code).toBe(1);
    expect(writes.join("")).toContain("forbidden-token");
  });
});
