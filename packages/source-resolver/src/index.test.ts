import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSourceEntry, SourceRegistry } from "@vision-control/source-registry";
import { CssTokenIndex } from "@vision-control/workspace-index";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CSS_MODULES_STUB,
  checkCssModulesSupport,
  checkTailwindTokenSupport,
  extractSnippet,
  isStaleEntry,
  SourceResolver,
  TAILWIND_TOKEN_STUB,
} from "./index.js";

const FRESH_FINGERPRINT = "abcd1234";
const STALE_FINGERPRINT = "stale9999";

const makeEntry = (overrides: Partial<Parameters<typeof createSourceEntry>[0]> = {}) =>
  createSourceEntry({
    sourceId: "src-abc123",
    workspaceRelativePath: "src/Button.tsx",
    range: { startLine: 2, startColumn: 4, endLine: 2, endColumn: 20 },
    componentName: "Button",
    fingerprint: FRESH_FINGERPRINT,
    ...overrides,
  });

const makeIdentity = (overrides: Record<string, unknown> = {}) => ({
  runtimeId: "r-001",
  tagName: "button",
  frameId: "main",
  fingerprint: FRESH_FINGERPRINT,
  confidence: "high" as const,
  ...overrides,
});

let tmpRoot: string;
let buttonPath: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "vc-resolver-"));
  const lines = [
    "import React from 'react';",
    "",
    "export const Button = () => {",
    '  return <button className="btn">Click me</button>;',
    "};",
    "",
  ];
  buttonPath = join(tmpRoot, "src", "Button.tsx");
  await mkdir(join(tmpRoot, "src"), { recursive: true });
  await writeFile(buttonPath, lines.join("\n"));
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

const makeResolver = (
  overrides: { registry?: SourceRegistry; cssTokenIndex?: CssTokenIndex } = {},
) => {
  const registry = overrides.registry ?? new SourceRegistry();
  const cssTokenIndex = overrides.cssTokenIndex ?? new CssTokenIndex();
  return new SourceResolver({ registry, cssTokenIndex, workspaceRoot: tmpRoot });
};

describe("SourceResolver — source marker priority (HIGH)", () => {
  it("returns HIGH confidence when marker matches and fingerprint is fresh", () => {
    const registry = new SourceRegistry();
    registry.register(makeEntry());
    const resolver = makeResolver({ registry: registry });
    const result = resolver.resolve(makeIdentity({ sourceId: "src-abc123" }));
    expect(result.confidence).toBe("high");
    expect(result.sourceId).toBe("src-abc123");
    expect(result.workspaceRelativePath).toBe("src/Button.tsx");
    expect(result.componentName).toBe("Button");
    expect(result.warnings).toEqual([]);
    expect(result.snippet).toBeDefined();
    expect(result.snippet).toContain("Button");
  });

  it("extracts a numbered snippet around the source range", () => {
    const registry = new SourceRegistry();
    registry.register(makeEntry());
    const resolver = makeResolver({ registry: registry });
    const result = resolver.resolve(makeIdentity({ sourceId: "src-abc123" }));
    expect(result.snippet).toMatch(/^\s*\d+:/m);
  });
});

describe("SourceResolver — stale registry downgrade (MEDIUM)", () => {
  it("returns MEDIUM with stale warning when fingerprint differs — NOT HIGH", () => {
    const registry = new SourceRegistry();
    registry.register(makeEntry());
    const resolver = makeResolver({ registry: registry });
    const result = resolver.resolve(
      makeIdentity({ sourceId: "src-abc123", fingerprint: STALE_FINGERPRINT }),
    );
    expect(result.confidence).toBe("medium");
    expect(result.confidence).not.toBe("high");
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("stale registry")]),
    );
    expect(result.workspaceRelativePath).toBe("src/Button.tsx");
  });
});

describe("SourceResolver — repeated instance ambiguity (MEDIUM)", () => {
  it("returns MEDIUM with ambiguity warning when multiple instances share source id", () => {
    const registry = new SourceRegistry();
    registry.register(makeEntry());
    const resolver = makeResolver({ registry: registry });
    const result = resolver.resolve(makeIdentity({ sourceId: "src-abc123" }), {
      runtimeInstanceCount: 3,
    });
    expect(result.confidence).toBe("medium");
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("repeated instance ambiguity")]),
    );
  });
});

describe("SourceResolver — static CSS class origin (MEDIUM)", () => {
  it("returns MEDIUM pointing to CSS file when class matches exactly one definition", () => {
    const cssTokens = new CssTokenIndex();
    cssTokens.addEntry({
      className: "btn",
      workspaceRelativePath: "src/styles.css",
      line: 5,
      column: 0,
      selector: ".btn",
    });
    const resolver = makeResolver({ cssTokenIndex: cssTokens });
    const result = resolver.resolve(makeIdentity(), { cssClasses: ["btn"] });
    expect(result.confidence).toBe("medium");
    expect(result.staticClassName).toBe("btn");
    expect(result.cssFilePath).toBe("src/styles.css");
    expect(result.cssLine).toBe(5);
    expect(result.warnings).toEqual([]);
  });

  it("returns LOW with conflicting warning when class is defined in multiple locations", () => {
    const cssTokens = new CssTokenIndex();
    cssTokens.addEntry({
      className: "btn",
      workspaceRelativePath: "a.css",
      line: 1,
      column: 0,
      selector: ".btn",
    });
    cssTokens.addEntry({
      className: "btn",
      workspaceRelativePath: "b.css",
      line: 10,
      column: 0,
      selector: ".btn",
    });
    const resolver = makeResolver({ cssTokenIndex: cssTokens });
    const result = resolver.resolve(makeIdentity(), { cssClasses: ["btn"] });
    expect(result.confidence).toBe("low");
    expect(result.confidence).not.toBe("high");
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("conflicting candidates")]),
    );
  });
});

describe("SourceResolver — low-confidence fallback", () => {
  it("returns LOW with unable-to-resolve warning when nothing matches", () => {
    const resolver = makeResolver();
    const result = resolver.resolve(makeIdentity());
    expect(result.confidence).toBe("low");
    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("unable to resolve source")]),
    );
  });

  it("falls through to LOW when sourceId is not in the registry", () => {
    const resolver = makeResolver();
    const result = resolver.resolve(makeIdentity({ sourceId: "unknown-id" }));
    expect(result.confidence).toBe("low");
  });
});

describe("isStaleEntry", () => {
  it("returns false when fingerprints match", () => {
    const entry = makeEntry();
    expect(isStaleEntry(entry, FRESH_FINGERPRINT)).toBe(false);
  });

  it("returns true when fingerprints differ", () => {
    const entry = makeEntry();
    expect(isStaleEntry(entry, STALE_FINGERPRINT)).toBe(true);
  });
});

describe("extractSnippet", () => {
  it("extracts numbered lines around the range", () => {
    const snippet = extractSnippet(buttonPath, 3, 3, 1);
    expect(snippet).toBeDefined();
    expect(snippet).toContain("3:");
    expect(snippet).toContain("Button");
  });

  it("returns undefined for a non-existent file", () => {
    expect(extractSnippet("/nonexistent/file.tsx", 1, 1)).toBeUndefined();
  });

  it("caps at MAX_SNIPPET_LINES", () => {
    const snippet = extractSnippet(buttonPath, 4, 4, 100);
    expect(snippet).toBeDefined();
    const lineCount = snippet?.split("\n").length ?? 0;
    expect(lineCount).toBeLessThanOrEqual(20);
  });
});

describe("V1 stubs", () => {
  it("Tailwind token-aware editing returns unsupported", () => {
    const result = checkTailwindTokenSupport();
    expect(result.supported).toBe(false);
    expect(result.diagnostic).toContain("Tailwind");
    expect(TAILWIND_TOKEN_STUB.supported).toBe(false);
  });

  it("CSS Modules mapping returns unsupported", () => {
    const result = checkCssModulesSupport();
    expect(result.supported).toBe(false);
    expect(result.diagnostic).toContain("CSS Modules");
    expect(CSS_MODULES_STUB.supported).toBe(false);
  });
});
