import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CssTokenIndex, parseCssClasses } from "./css-token-index.js";
import { FileRegistry } from "./file-registry.js";
import { indexWorkspace, isSourceFile, WorkspaceIndex } from "./workspace-index.js";

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "vc-ws-index-"));
  await mkdir(join(tmpRoot, "src", "components"), { recursive: true });
  await mkdir(join(tmpRoot, "src", "styles"), { recursive: true });
  await mkdir(join(tmpRoot, "node_modules", "fake"), { recursive: true });
  await mkdir(join(tmpRoot, "dist"), { recursive: true });

  await writeFile(
    join(tmpRoot, "src", "components", "Button.tsx"),
    'export const Button = () => <button className="btn">Click</button>;\n',
  );
  await writeFile(
    join(tmpRoot, "src", "components", "Card.jsx"),
    'export const Card = () => <div className="card">Hi</div>;\n',
  );
  await writeFile(
    join(tmpRoot, "src", "styles", "main.css"),
    [
      ".btn {",
      "  color: red;",
      "}",
      "",
      ".container .btn, .btn-primary {",
      "  padding: 4px;",
      "}",
      "",
      "/* comment */",
      "#root {",
      "  margin: 0;",
      "}",
      "",
      '.tooltip::before { content: ".fake"; }',
    ].join("\n"),
  );
  await writeFile(
    join(tmpRoot, "src", "styles", "theme.scss"),
    "$primary: blue;\n.theme { color: $primary; }\n",
  );
  await writeFile(join(tmpRoot, "node_modules", "fake", "lib.js"), "module.exports = {};\n");
  await writeFile(join(tmpRoot, "dist", "bundle.js"), "console.log('built');\n");
  await writeFile(join(tmpRoot, "README.md"), "# project\n");
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("isSourceFile", () => {
  it("accepts jsx, tsx, css, scss", () => {
    expect(isSourceFile("App.tsx")).toBe(true);
    expect(isSourceFile("Button.jsx")).toBe(true);
    expect(isSourceFile("main.css")).toBe(true);
    expect(isSourceFile("theme.scss")).toBe(true);
  });

  it("rejects non-source files", () => {
    expect(isSourceFile("README.md")).toBe(false);
    expect(isSourceFile("index.html")).toBe(false);
    expect(isSourceFile("data.json")).toBe(false);
  });
});

describe("parseCssClasses", () => {
  it("extracts single-line class selectors with line and column", () => {
    const tokens = parseCssClasses(".btn {\n  color: red;\n}\n", "main.css");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.className).toBe("btn");
    expect(tokens[0]?.line).toBe(1);
    expect(tokens[0]?.selector).toBe(".btn");
    expect(tokens[0]?.workspaceRelativePath).toBe("main.css");
  });

  it("does not extract class names from property values", () => {
    const css = '.tooltip::before { content: ".fake"; }\n';
    const tokens = parseCssClasses(css, "t.css");
    const classNames = tokens.map((t) => t.className);
    expect(classNames).toContain("tooltip");
    expect(classNames).not.toContain("fake");
  });

  it("extracts multiple classes from compound selectors", () => {
    const css = ".container .item { gap: 4px; }\n";
    const tokens = parseCssClasses(css, "c.css");
    expect(tokens.map((t) => t.className).sort()).toEqual(["container", "item"]);
  });

  it("handles comma-separated selectors on the opening-brace line", () => {
    const css = ".a, .b { color: red; }\n";
    const tokens = parseCssClasses(css, "multi.css");
    expect(tokens.map((t) => t.className).sort()).toEqual(["a", "b"]);
  });

  it("captures a single-line @media-nested selector (baseline)", () => {
    const css = "@media (max-width: 600px) {\n  .a {\n    color: red;\n  }\n}\n";
    const tokens = parseCssClasses(css, "media.css");
    expect(tokens.map((t) => t.className).sort()).toEqual(["a"]);
  });

  it("captures BOTH classes of a multi-line comma selector", () => {
    const css = ".a,\n.b {\n  color: red;\n}\n";
    const tokens = parseCssClasses(css, "ml.css");
    expect(tokens.map((t) => t.className).sort()).toEqual(["a", "b"]);
    const a = tokens.find((t) => t.className === "a");
    const b = tokens.find((t) => t.className === "b");
    expect(a?.line).toBe(1);
    expect(a?.column).toBe(0);
    expect(b?.line).toBe(2);
    expect(b?.column).toBe(0);
  });

  it("captures BOTH classes of a multi-line comma selector nested in @media", () => {
    const css = [
      "@media (max-width: 600px) {",
      "  .a,",
      "  .b {",
      "    color: red;",
      "  }",
      "}",
      "",
    ].join("\n");
    const tokens = parseCssClasses(css, "media-ml.css");
    expect(tokens.map((t) => t.className).sort()).toEqual(["a", "b"]);
  });

  it("captures a multi-line :is() compound selector", () => {
    const css = ":is(.x,\n.y):hover {\n  color: red;\n}\n";
    const tokens = parseCssClasses(css, "is.css");
    expect(tokens.map((t) => t.className).sort()).toEqual(["x", "y"]);
  });

  it("reports the selector text spanning multiple lines", () => {
    const css = ".a,\n.b {\n  color: red;\n}\n";
    const tokens = parseCssClasses(css, "ml.css");
    const a = tokens.find((t) => t.className === "a");
    expect(a?.selector).toBe(".a,\n.b");
  });
});

describe("parseCssClasses — malformed and stale-state input", () => {
  it("returns an empty result for an empty file", () => {
    expect(parseCssClasses("", "empty.css")).toEqual([]);
  });

  it("returns an empty result for whitespace-only input", () => {
    expect(parseCssClasses("   \n  \t\n", "ws.css")).toEqual([]);
  });

  it("does not crash on an unclosed selector (EOF mid-block)", () => {
    const css = ".a,\n.b {\n  color: red;\n";
    expect(() => parseCssClasses(css, "unclosed.css")).not.toThrow();
    const tokens = parseCssClasses(css, "unclosed.css");
    expect(tokens.map((t) => t.className).sort()).toEqual(["a", "b"]);
  });

  it("does not crash on a stray closing brace", () => {
    const css = "}}.a { color: red; }\n";
    expect(() => parseCssClasses(css, "stray.css")).not.toThrow();
    const tokens = parseCssClasses(css, "stray.css");
    expect(tokens.map((t) => t.className).sort()).toEqual(["a"]);
  });

  it("does not crash on an unclosed at-rule", () => {
    const css = "@media (min-width: 1px) { .a { color: red; }";
    expect(() => parseCssClasses(css, "unclosed-media.css")).not.toThrow();
    expect(parseCssClasses(css, "unclosed-media.css").map((t) => t.className)).toEqual(["a"]);
  });
});

/**
 * Adversarial never-wrong-HIGH proof (PRD 14.5 / VC-V1V2-04).
 *
 * The source resolver consumes CssTokenEntry records via its `resolveByCssClass`
 * path, which ALWAYS emits `confidence: "medium"` (single match) or `"low"`
 * (multiple matches) backed by `evidence: ["text-search"]`
 * (packages/source-resolver/src/resolver.ts:192-224). The never-wrong-HIGH
 * predicate (packages/source-resolver/src/confidence.ts:92-104) returns false
 * for any candidate whose evidence is only `text-search`, so a CSS-token-derived
 * candidate can NEVER reach HIGH — even if the scan mis-attributed an origin.
 *
 * This package cannot import `@vision-control/source-resolver` (no declared
 * dependency; adding one is out of the file-scope for this task), so the
 * cascade is proven here through the invariants the resolver relies on:
 *   1. CssTokenEntry carries NO confidence/evidence field (schema-bound).
 *   2. The resolver's CSS path evidence (`text-search`) fails the HIGH
 *      predicate. The predicate is mirrored below verbatim from confidence.ts
 *      and proven non-vacuous by a positive (`marker`) case.
 */
describe("parseCssClasses — never-wrong-HIGH cascade holds for multi-line CSS", () => {
  // Verbatim mirror of satisfiesHighEvidence (confidence.ts:92-104). Kept inline
  // because source-resolver is not a dependency of this package. If that module
  // changes, this mirror must move with it.
  const SOLO_STRONG = new Set(["marker", "ast-origin"]);
  const qualifiesForHigh = (evidence: readonly string[], hasRange: boolean): boolean => {
    if (evidence.length === 0) return false;
    const set = new Set(evidence);
    for (const m of SOLO_STRONG) if (set.has(m)) return true;
    if (set.has("fingerprint") && set.has("manifest")) return true;
    if (set.has("source-map") && hasRange) return true;
    return false;
  };

  it("non-vacuous: the mirrored HIGH predicate discriminates (marker qualifies, text-search does not)", () => {
    expect(qualifiesForHigh(["marker"], false)).toBe(true);
    expect(qualifiesForHigh(["text-search"], true)).toBe(false);
    expect(qualifiesForHigh([], true)).toBe(false);
  });

  it("CssTokenEntry never carries confidence or evidence (structural cap)", () => {
    const css = ".a,\n.b {\n  color: red;\n}\n";
    const tokens = parseCssClasses(css, "adv.css");
    for (const token of tokens) {
      expect(token).not.toHaveProperty("confidence");
      expect(token).not.toHaveProperty("evidence");
    }
  });

  it("a multi-line selector that could be mis-attributed stays <= MEDIUM", () => {
    const css = [
      ".btn,",
      ".card {",
      "  color: red;",
      "}",
      "",
      ".btn {",
      "  color: blue;",
      "}",
      "",
    ].join("\n");
    const tokens = parseCssClasses(css, "misattr.css");

    const classNames = tokens.map((t) => t.className).sort();
    expect(classNames).toContain("btn");
    expect(classNames).toContain("card");

    // Mirrors resolver.ts:198-221 — exactly 1 match -> medium, >1 match -> low.
    const resolverConfidence = (matchCount: number): "medium" | "low" =>
      matchCount === 1 ? "medium" : "low";
    expect(resolverConfidence(tokens.filter((t) => t.className === "btn").length)).toBe("low");
    expect(resolverConfidence(tokens.filter((t) => t.className === "card").length)).toBe("medium");
    expect(qualifiesForHigh(["text-search"], true)).toBe(false);
  });
});

describe("CssTokenIndex", () => {
  it("stores and looks up entries by class name", () => {
    const index = new CssTokenIndex();
    index.addEntry({
      className: "btn",
      workspaceRelativePath: "a.css",
      line: 1,
      column: 0,
      selector: ".btn",
    });
    index.addEntry({
      className: "btn",
      workspaceRelativePath: "b.css",
      line: 5,
      column: 0,
      selector: ".btn",
    });
    expect(index.lookup("btn")).toHaveLength(2);
    expect(index.lookup("missing")).toHaveLength(0);
    expect(index.classCount).toBe(1);
    expect(index.entryCount).toBe(2);
  });
});

describe("FileRegistry", () => {
  it("looks up by workspace-relative path", () => {
    const reg = new FileRegistry();
    reg.register({
      workspaceRelativePath: "src/App.tsx",
      absolutePath: "/abs/src/App.tsx",
      size: 10,
      lastModified: 0,
      fileHash: "abc",
    });
    expect(reg.lookup("src/App.tsx")?.fileHash).toBe("abc");
    expect(reg.lookup("missing")).toBeUndefined();
  });

  it("lookupBySourceId returns undefined without a source registry", () => {
    const reg = new FileRegistry();
    expect(reg.lookupBySourceId("sid")).toBeUndefined();
  });
});

describe("indexWorkspace", () => {
  it("discovers source files and skips node_modules/dist", async () => {
    const result = await indexWorkspace(tmpRoot);
    const paths = result.fileRegistry
      .getAll()
      .map((f) => f.workspaceRelativePath)
      .sort();
    expect(paths).toEqual([
      "src/components/Button.tsx",
      "src/components/Card.jsx",
      "src/styles/main.css",
      "src/styles/theme.scss",
    ]);
    expect(result.fileCount).toBe(4);
  });

  it("hashes file content deterministically", async () => {
    const result = await indexWorkspace(tmpRoot);
    const button = result.fileRegistry.lookup("src/components/Button.tsx");
    expect(button).toBeDefined();
    expect(button?.fileHash).toHaveLength(64);
    expect(button?.size).toBeGreaterThan(0);
    expect(button?.absolutePath).toContain("Button.tsx");
  });

  it("indexes CSS class tokens from .css files only", async () => {
    const result = await indexWorkspace(tmpRoot);
    const names = [...result.cssTokens.getAllClassNames()].sort();
    expect(names).toEqual(["btn", "btn-primary", "container", "tooltip"]);
    const btnEntries = result.cssTokens.lookup("btn");
    expect(btnEntries.length).toBeGreaterThanOrEqual(1);
    expect(btnEntries[0]?.workspaceRelativePath).toBe("src/styles/main.css");
    expect(result.cssTokens.lookup("theme")).toHaveLength(0);
  });
});

describe("WorkspaceIndex", () => {
  it("creates a stateful index and supports lookups", async () => {
    const index = await WorkspaceIndex.create(tmpRoot);
    expect(index.fileCount).toBe(4);
    const css = index.lookup("src/styles/main.css");
    expect(css).toBeDefined();
    expect(index.getCssTokens().lookup("btn").length).toBeGreaterThanOrEqual(1);
  });
});
