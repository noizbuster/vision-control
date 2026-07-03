import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SuggestedDiff } from "@vision-control/source-resolver";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applySuggestion } from "./apply-suggestion.js";

function sampleSuggestion(overrides: Partial<SuggestedDiff> = {}): SuggestedDiff {
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
    ...overrides,
  };
}

describe("codemod apply-suggestion: confirmation gate", () => {
  it("refuses to apply without --confirm (misleading-success-output guard)", async () => {
    const result = await applySuggestion(sampleSuggestion(), {
      confirm: false,
      workspaceRoot: "/tmp",
    });
    expect(result.kind).toBe("refused");
    if (result.kind === "refused") {
      expect(result.reason).toContain("--confirm");
    }
  });

  it("the refused result never writes anything (no file mutation)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vc-codemod-refuse-"));
    try {
      const targetPath = join(dir, "src", "Button.tsx");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(dir, "src"), { recursive: true });
      const original = 'export const Button = () => <button className="px-3">Save</button>;\n';
      const { writeFile } = await import("node:fs/promises");
      await writeFile(targetPath, original, "utf-8");

      const result = await applySuggestion(sampleSuggestion(), {
        confirm: false,
        workspaceRoot: dir,
      });
      expect(result.kind).toBe("refused");

      const after = await readFile(targetPath, "utf-8");
      expect(after).toBe(original);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("codemod apply-suggestion: apply with --confirm", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vc-codemod-apply-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function writeFixture(relativePath: string, content: string): Promise<string> {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const fullPath = join(dir, relativePath);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
    return fullPath;
  }

  it("writes the diff through fs.writeFile and source-verifies the result", async () => {
    const original = [
      "import React from 'react';",
      'export const Button = () => <button className="px-3">Save</button>;',
      "",
    ].join("\n");
    await writeFixture("src/Button.tsx", original);

    const result = await applySuggestion(sampleSuggestion(), {
      confirm: true,
      workspaceRoot: dir,
    });

    expect(result.kind).toBe("applied");
    if (result.kind === "applied") {
      expect(result.verification.sourceVerified).toBe(true);
      expect(result.filePath).toBe("src/Button.tsx");
    }

    const after = await readFile(join(dir, "src/Button.tsx"), "utf-8");
    expect(after).toContain("px-4");
    expect(after).not.toContain("px-3");
  });

  it("the written file contains the new line at the expected position", async () => {
    const original = [
      "import React from 'react';",
      'export const Button = () => <button className="px-3">Save</button>;',
      "export const Other = () => <div />;",
    ].join("\n");
    await writeFixture("src/Button.tsx", original);

    await applySuggestion(sampleSuggestion(), {
      confirm: true,
      workspaceRoot: dir,
    });

    const after = await readFile(join(dir, "src/Button.tsx"), "utf-8");
    const lines = after.split("\n");
    expect(lines[1]).toContain("px-4");
    expect(lines[2]).toContain("export const Other");
  });
});

describe("codemod apply-suggestion: stale-state guard", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vc-codemod-stale-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("detects a stale suggestion (file changed since suggestion was generated)", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(dir, "src"), { recursive: true });
    // The file no longer matches the suggestion's "before" state (px-5 instead of px-3).
    const changedContent = [
      "import React from 'react';",
      'export const Button = () => <button className="px-5">Save</button>;',
      "",
    ].join("\n");
    await writeFile(join(dir, "src/Button.tsx"), changedContent, "utf-8");

    const result = await applySuggestion(sampleSuggestion(), {
      confirm: true,
      workspaceRoot: dir,
    });

    expect(result.kind).toBe("stale");
    if (result.kind === "stale") {
      expect(result.reason).toContain("no longer matches");
    }

    // The stale suggestion must NOT have written anything.
    const after = await readFile(join(dir, "src/Button.tsx"), "utf-8");
    expect(after).toBe(changedContent);
  });
});

describe("codemod apply-suggestion: source verification", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vc-codemod-verify-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("verification catches a mismatch if the write did not land at the expected line", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(dir, "src"), { recursive: true });
    const original = [
      "import React from 'react';",
      'export const Button = () => <button className="px-3">Save</button>;',
      "",
    ].join("\n");
    await writeFile(join(dir, "src/Button.tsx"), original, "utf-8");

    // A suggestion whose source range points at the WRONG line (line 1, not 2).
    const wrongRangeSuggestion = sampleSuggestion({
      sourceRanges: [{ startLine: 1, startColumn: 0, endLine: 1, endColumn: 30 }],
    });

    // With a wrong range, the staleness check should fire because line 1 does not match the removals.
    const result = await applySuggestion(wrongRangeSuggestion, {
      confirm: true,
      workspaceRoot: dir,
    });
    expect(result.kind).toBe("stale");
  });
});

describe("codemod apply-suggestion: malformed input", () => {
  it("returns an error when the target file does not exist", async () => {
    const result = await applySuggestion(sampleSuggestion(), {
      confirm: true,
      workspaceRoot: "/nonexistent-workspace-root-vc-test",
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.reason).toContain("cannot read");
    }
  });

  it("returns an error when the suggestion has no source range", async () => {
    const noRange = sampleSuggestion({ sourceRanges: [] });
    const result = await applySuggestion(noRange, {
      confirm: true,
      workspaceRoot: "/tmp",
    });
    // With no source range, the first range is undefined -> error path.
    expect(result.kind).toBe("error");
  });
});
