import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkBoundaries } from "./boundaries.js";

type Platform = "browser" | "isomorphic" | "node";
type PType = "app" | "fixture" | "integration" | "library";

const makePackage = (
  root: string,
  name: string,
  platform: Platform,
  type: PType,
  packageName: string,
  indexSource: string,
): void => {
  const dir = path.join(root, "packages", name);
  mkdirSync(path.join(dir, "src"), { recursive: true });
  writeFileSync(
    path.join(dir, "project.json"),
    JSON.stringify({
      name,
      tags: [`platform:${platform}`, `type:${type}`, `scope:${name}`],
      sourceRoot: `packages/${name}/src`,
    }),
  );
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: packageName }));
  writeFileSync(path.join(dir, "src", "index.ts"), indexSource);
};

describe("checkBoundaries", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "vc-bnd-"));
  });

  afterEach(() => {
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  it("flags a node package importing a browser package", () => {
    makePackage(
      root,
      "nodepkg",
      "node",
      "library",
      "@vision-control/nodepkg",
      [
        "// node consumer",
        'import { X } from "@vision-control/browserpkg";',
        "export const X = X;",
      ].join("\n"),
    );
    makePackage(
      root,
      "browserpkg",
      "browser",
      "library",
      "@vision-control/browserpkg",
      "export const X = 1;\n",
    );
    makePackage(
      root,
      "cleanpkg",
      "isomorphic",
      "library",
      "@vision-control/cleanpkg",
      "export const Y = 2;\n",
    );

    const report = checkBoundaries(root);

    const nodeViolations = report.violations.filter((v) => v.rule === "node-imports-browser");
    expect(nodeViolations.length).toBe(1);
    expect(nodeViolations[0]?.importer).toBe("@vision-control/nodepkg");
    expect(nodeViolations[0]?.specifier).toBe("@vision-control/browserpkg");
  });

  it("flags deep imports of another package's src/*", () => {
    // Built by concatenation so this test file does not itself contain a
    // parseable deep-import specifier (the checker scans every .ts/.tsx file,
    // including this one).
    const deepSpec = "@vision-control/beta/" + "src/internal";
    makePackage(
      root,
      "alpha",
      "isomorphic",
      "library",
      "@vision-control/alpha",
      [`import { deep } from "${deepSpec}";`, "export const z = deep;"].join("\n"),
    );
    makePackage(
      root,
      "beta",
      "isomorphic",
      "library",
      "@vision-control/beta",
      "export const deep = 0;\n",
    );

    const report = checkBoundaries(root);

    const deep = report.violations.filter((v) => v.rule === "deep-import");
    expect(deep.length).toBe(1);
    expect(deep[0]?.specifier).toBe("@vision-control/beta/src/internal");
  });

  it("passes a clean workspace with only public-root internal imports", () => {
    makePackage(
      root,
      "proto",
      "isomorphic",
      "library",
      "@vision-control/proto",
      "export const V = 1;\n",
    );
    makePackage(
      root,
      "consumer",
      "node",
      "library",
      "@vision-control/consumer",
      'import { V } from "@vision-control/proto";\nexport const W = V;\n',
    );

    const report = checkBoundaries(root);

    expect(report.violations).toEqual([]);
    expect(report.filesScanned).toBeGreaterThanOrEqual(2);
  });

  it("allows an isomorphic importer to use a browser package (rule is node->browser only)", () => {
    makePackage(
      root,
      "iso",
      "isomorphic",
      "library",
      "@vision-control/iso",
      'import { B } from "@vision-control/br";\nexport const C = B;\n',
    );
    makePackage(root, "br", "browser", "library", "@vision-control/br", "export const B = 1;\n");

    const report = checkBoundaries(root);

    expect(report.violations).toEqual([]);
  });

  // Baseline characterization: pin the existing node->browser direction so the
  // symmetric browser->node addition cannot regress it.
  it("baseline: still flags a node package importing a browser package alongside the reverse direction", () => {
    makePackage(
      root,
      "n2b",
      "node",
      "library",
      "@vision-control/n2b",
      'import { X } from "@vision-control/br2";\nexport const Y = X;\n',
    );
    makePackage(root, "br2", "browser", "library", "@vision-control/br2", "export const X = 1;\n");

    const report = checkBoundaries(root);

    const nodeViolations = report.violations.filter((v) => v.rule === "node-imports-browser");
    expect(nodeViolations.length).toBe(1);
    expect(nodeViolations[0]?.importer).toBe("@vision-control/n2b");
    expect(nodeViolations[0]?.specifier).toBe("@vision-control/br2");
  });

  // Failing-first: a platform:browser package VALUE-importing a platform:node
  // package MUST be flagged as `browser-imports-node`. Without the rule this is
  // a false-pass; the symmetric rule makes the proof sound (PRD 20.3).
  it("flags a browser package value-importing a node package (browser-imports-node)", () => {
    makePackage(
      root,
      "br2n",
      "browser",
      "library",
      "@vision-control/br2n",
      [
        "// browser consumer",
        'import { pureHelper } from "@vision-control/nodepkg2";',
        "export const Z = pureHelper;",
      ].join("\n"),
    );
    makePackage(
      root,
      "nodepkg2",
      "node",
      "library",
      "@vision-control/nodepkg2",
      "export const pureHelper = 1;\n",
    );

    const report = checkBoundaries(root);

    const browserViolations = report.violations.filter((v) => v.rule === "browser-imports-node");
    expect(browserViolations.length).toBe(1);
    expect(browserViolations[0]?.importer).toBe("@vision-control/br2n");
    expect(browserViolations[0]?.specifier).toBe("@vision-control/nodepkg2");
  });

  it("allows a type-only browser→node import (erased at compile, no runtime dep)", () => {
    makePackage(
      root,
      "brtype",
      "browser",
      "library",
      "@vision-control/brtype",
      'import type { OnlyAType } from "@vision-control/nodetype";\nexport type R = OnlyAType;\n',
    );
    makePackage(
      root,
      "nodetype",
      "node",
      "library",
      "@vision-control/nodetype",
      "export type OnlyAType = string;\n",
    );

    const report = checkBoundaries(root);

    expect(report.violations).toEqual([]);
  });

  it("does not flag browser→node value imports inside test files (tests run under a node runner, not the browser bundle)", () => {
    const dir = path.join(root, "packages", "brtest");
    mkdirSync(path.join(dir, "src"), { recursive: true });
    writeFileSync(
      path.join(dir, "project.json"),
      JSON.stringify({
        name: "brtest",
        tags: ["platform:browser", "type:library", "scope:brtest"],
        sourceRoot: "packages/brtest/src",
      }),
    );
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "@vision-control/brtest" }),
    );
    writeFileSync(path.join(dir, "src", "index.ts"), "export const ok = 1;\n");
    writeFileSync(
      path.join(dir, "src", "index.test.ts"),
      'import { helper } from "@vision-control/nodetest";\nexport const r = helper;\n',
    );
    makePackage(
      root,
      "nodetest",
      "node",
      "library",
      "@vision-control/nodetest",
      "export const helper = 2;\n",
    );

    const report = checkBoundaries(root);

    expect(report.violations.filter((v) => v.rule === "browser-imports-node")).toEqual([]);
  });
});
