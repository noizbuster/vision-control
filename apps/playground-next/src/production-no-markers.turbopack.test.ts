import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CWD = process.cwd();
const DIST_DIR = ".next-turbo";
const DIST_PATH = join(CWD, DIST_DIR);
const NEXT_BIN = join(CWD, "node_modules", ".bin", "next");

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

const collectFiles = (dir: string, exts: readonly string[]): string[] => {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (isDirectory(full)) {
      results.push(...collectFiles(full, exts));
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
};

const grepInFiles = (
  files: readonly string[],
  pattern: RegExp,
): { file: string; count: number }[] => {
  const hits: { file: string; count: number }[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const globalRe = new RegExp(pattern.source, "g");
    const matches = content.match(globalRe);
    if (matches !== null && matches.length > 0) {
      hits.push({ file, count: matches.length });
    }
  }
  return hits;
};

const runTurbopackBuild = (): void => {
  rmSync(DIST_PATH, { recursive: true, force: true });
  const result = spawnSync(NEXT_BIN, ["build", "--turbo"], {
    cwd: CWD,
    env: {
      ...process.env,
      NODE_ENV: "production",
      VC_TURBO_TEST_DISTDIR: DIST_DIR,
    },
    encoding: "utf8",
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(
      `next build --turbo failed (exit ${result.status}).\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
};

describe("production marker safety — Turbopack (ADR-008, VC-V1V2-13)", () => {
  it("next build --turbo is a valid command on Next 15.5.4 and produces a build", () => {
    runTurbopackBuild();
    expect(existsSync(DIST_PATH)).toBe(true);
    expect(isDirectory(DIST_PATH)).toBe(true);
  });

  it("next build --turbo output contains ZERO data-vc-source markers", () => {
    if (!isDirectory(DIST_PATH)) {
      throw new Error(`${DIST_DIR}/ not found — the build test above must run first`);
    }
    const files = collectFiles(DIST_PATH, [".js", ".mjs", ".html"]);
    expect(files.length).toBeGreaterThan(0);
    expect(grepInFiles(files, /data-vc-source/)).toEqual([]);
  });

  it("next build --turbo output contains ZERO vision-control source-id tokens", () => {
    if (!isDirectory(DIST_PATH)) {
      throw new Error(`${DIST_DIR}/ not found — the build test above must run first`);
    }
    const files = collectFiles(DIST_PATH, [".js", ".mjs"]);
    expect(grepInFiles(files, /vc-source|vision-control-source/)).toEqual([]);
  });

  it("next build --turbo server HTML contains ZERO vc-source attributes", () => {
    if (!isDirectory(DIST_PATH)) {
      throw new Error(`${DIST_DIR}/ not found — the build test above must run first`);
    }
    const htmlFiles = collectFiles(DIST_PATH, [".html"]);
    expect(grepInFiles(htmlFiles, /vc-source/i)).toEqual([]);
  });
});
