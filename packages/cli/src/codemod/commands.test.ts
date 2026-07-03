import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadSuggestion, runCodemodApply, runCodemodPreview } from "./commands.js";

function validSuggestionJson(): Record<string, unknown> {
  return {
    kind: "tailwind-token-replace",
    filePath: "src/Button.tsx",
    diff: [
      "--- a/src/Button.tsx",
      "+++ b/src/Button.tsx",
      "@@ -2,1 +2,1 @@",
      '-export const Button = () => <button className="px-3">Save</button>;',
      '+export const Button = () => <button className="px-4">Save</button>;',
    ].join("\n"),
    sourceRanges: [{ startLine: 2, startColumn: 0, endLine: 2, endColumn: 60 }],
    confidence: "high",
    preconditions: ["Verify the className is present after HMR."],
  };
}

describe("codemod commands: loadSuggestion", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vc-codemod-cmd-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("loads and validates a well-formed suggestion JSON", async () => {
    const suggestionPath = join(dir, "suggestion.json");
    await writeFile(suggestionPath, JSON.stringify(validSuggestionJson()), "utf-8");

    const result = await loadSuggestion(suggestionPath);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.suggestion.kind).toBe("tailwind-token-replace");
      expect(result.suggestion.filePath).toBe("src/Button.tsx");
    }
  });

  it("returns an error for a non-existent file", async () => {
    const result = await loadSuggestion(join(dir, "nonexistent.json"));
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toContain("cannot read");
    }
  });

  it("returns an error for invalid JSON", async () => {
    const suggestionPath = join(dir, "bad.json");
    await writeFile(suggestionPath, "{not valid json", "utf-8");
    const result = await loadSuggestion(suggestionPath);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toContain("invalid JSON");
    }
  });

  it("returns an error for a JSON that does not match SuggestedDiffSchema", async () => {
    const suggestionPath = join(dir, "wrong-shape.json");
    await writeFile(
      suggestionPath,
      JSON.stringify({ kind: "not-a-real-kind", filePath: "x.ts" }),
      "utf-8",
    );
    const result = await loadSuggestion(suggestionPath);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toContain("SuggestedDiffSchema");
    }
  });
});

describe("codemod commands: runCodemodPreview", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vc-codemod-preview-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("shows the diff preview and returns exit code 0", async () => {
    const suggestionPath = join(dir, "suggestion.json");
    await writeFile(suggestionPath, JSON.stringify(validSuggestionJson()), "utf-8");

    const writes: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => {
      writes.push(data);
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await runCodemodPreview(suggestionPath);
      expect(code).toBe(0);
    } finally {
      process.stdout.write = originalWrite;
    }

    const output = writes.join("");
    expect(output).toContain("tailwind-token-replace");
    expect(output).toContain("src/Button.tsx");
    expect(output).toContain("precondition");
    expect(output).toContain("no source was written");
  });

  it("returns exit code 1 for an invalid suggestion file", async () => {
    const code = await runCodemodPreview(join(dir, "nonexistent.json"));
    expect(code).toBe(1);
  });
});

describe("codemod commands: runCodemodApply confirmation gate", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vc-codemod-apply-cmd-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses apply without --confirm and returns exit code 1", async () => {
    const suggestionPath = join(dir, "suggestion.json");
    await writeFile(suggestionPath, JSON.stringify(validSuggestionJson()), "utf-8");

    const originalCwd = process.cwd();
    process.chdir(dir);
    const writes: string[] = [];
    const originalStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((data: string) => {
      writes.push(data);
      return true;
    }) as typeof process.stderr.write;
    try {
      const code = await runCodemodApply(suggestionPath, false, {
        daemonUrl: "http://127.0.0.1:4321",
      });
      expect(code).toBe(1);
    } finally {
      process.stderr.write = originalStderr;
      process.chdir(originalCwd);
    }

    const output = writes.join("");
    expect(output).toContain("--confirm");
    expect(output).toContain("refused");
  });

  it("applies with --confirm, verifies, and returns exit code 0", async () => {
    const suggestionPath = join(dir, "suggestion.json");
    await writeFile(suggestionPath, JSON.stringify(validSuggestionJson()), "utf-8");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(
      join(dir, "src", "Button.tsx"),
      [
        "import React from 'react';",
        'export const Button = () => <button className="px-3">Save</button>;',
        "",
      ].join("\n"),
      "utf-8",
    );

    const originalCwd = process.cwd();
    process.chdir(dir);
    const writes: string[] = [];
    const originalStdout = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((data: string) => {
      writes.push(data);
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await runCodemodApply(suggestionPath, true, {
        daemonUrl: "http://127.0.0.1:4321",
      });
      expect(code).toBe(0);
    } finally {
      process.stdout.write = originalStdout;
      process.chdir(originalCwd);
    }

    const output = writes.join("");
    expect(output).toContain("applied");
    expect(output).toContain("verification: PASS");
  });
});
