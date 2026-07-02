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
